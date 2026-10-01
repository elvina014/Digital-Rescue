import { createClient } from "@/utils/supabase/server";
import { PART_TYPE_LABEL } from "@/components/catalog/partLabels";
import type { PickedPartSpec } from "@/components/catalog/PartSpecPicker";
import type { CompatSummaryRow, PartCompatInfo, RepairRecordData } from "./labels";

type SpecJoin = { id: string; part_type: string; name: string; compat_target: string } | null;

const toPicked = (s: SpecJoin): PickedPartSpec | null =>
  s && {
    partSpecId: s.id,
    label: `${PART_TYPE_LABEL[s.part_type] ?? s.part_type} · ${s.name}`,
    compatTarget: s.compat_target === "BOARD" ? "BOARD" : "MODEL",
  };

const ANSWER_OF: Record<string, "OK" | "CONDITIONAL" | "INCOMPATIBLE"> = {
  compatible: "OK",
  conditional: "CONDITIONAL",
  incompatible: "INCOMPATIBLE",
};

/**
 * 접수건 상세 페이지용 수리 기록 로더 (세션 클라이언트, RLS 적용).
 * 고객 정보는 포함하지 않는다.
 */
export async function loadRepairRecord(ticketId: string, ticketStatus: string): Promise<RepairRecordData> {
  const supabase = await createClient();

  const [record, symptoms, measurements, faults, actions, removedParts, symptomCodes, partsUsed, canEdit, settings, itemSpecs, evidence] =
    await Promise.all([
      supabase.from("repair_records").select("*").eq("ticket_id", ticketId).maybeSingle(),
      supabase.from("ticket_symptoms").select("*").eq("ticket_id", ticketId).order("created_at"),
      supabase.from("repair_measurements").select("*").eq("ticket_id", ticketId).order("sort_order").order("created_at"),
      supabase.from("repair_faults").select("*").eq("ticket_id", ticketId).order("sort_order").order("created_at"),
      supabase.from("repair_actions").select("*").eq("ticket_id", ticketId).order("sort_order").order("performed_at"),
      supabase.from("ticket_removed_parts").select("*, part_specs ( part_type, name )").eq("ticket_id", ticketId).order("created_at"),
      supabase.from("symptom_codes").select("*").order("sort_order").order("name"),
      supabase.from("repair_parts_used").select("*").eq("ticket_id", ticketId),
      supabase.rpc("repair_record_can_edit", { p_ticket_id: ticketId }),
      supabase.from("global_settings").select("ri_approval_gate_enabled, ri_cancel_gate_enabled").eq("id", true).single(),
      // 사용 부품 호환 확인 (Phase 3): 재고 행의 기본 부품 규격 + 이 접수건에서 남긴 유효 응답
      supabase
        .from("ticket_materials")
        .select("id, inventory_items ( part_specs ( id, part_type, name, compat_target ) )")
        .eq("ticket_id", ticketId),
      supabase
        .from("compatibility_evidence")
        .select("ticket_material_id, observed_status, limitation_note, compatibility_id, part_compatibility ( part_specs ( id, part_type, name, compat_target ) )")
        .eq("ticket_id", ticketId)
        .is("retracted_at", null)
        .not("ticket_material_id", "is", null),
    ]);

  const approvalEnabled = settings.data?.ri_approval_gate_enabled ?? false;
  const cancelEnabled = settings.data?.ri_cancel_gate_enabled ?? false;

  // 승인 게이트가 켜져 있고 승인 대기 중일 때만 미충족 항목을 계산한다
  let approvalMissing: string[] = [];
  if (approvalEnabled && ticketStatus === "WAITING_APPROVAL") {
    const { data } = await supabase.rpc("repair_gate_check", { p_ticket_id: ticketId, p_gate: "APPROVAL" });
    approvalMissing = ((data as { missing?: string[] } | null)?.missing ?? []) as string[];
  }

  const compatIds = (evidence.data ?? []).map((e) => e.compatibility_id);
  const summaries: CompatSummaryRow[] = compatIds.length
    ? ((await supabase.from("compatibility_summary").select("*").in("compatibility_id", compatIds)).data ?? [])
    : [];

  const partCompat: Record<string, PartCompatInfo> = {};
  for (const p of partsUsed.data ?? []) {
    if (!p.material_id) continue;
    const item = (itemSpecs.data ?? []).find((m) => m.id === p.material_id);
    const ev = (evidence.data ?? []).find((e) => e.ticket_material_id === p.material_id);
    const evSpec = toPicked((ev?.part_compatibility as unknown as { part_specs: SpecJoin } | null)?.part_specs ?? null);
    partCompat[p.material_id] = {
      excluded: !!p.is_outsourced || p.category_name === "소프트웨어",
      defaultSpec: toPicked((item?.inventory_items as unknown as { part_specs: SpecJoin } | null)?.part_specs ?? null),
      answer:
        ev && evSpec
          ? {
              answer: ANSWER_OF[ev.observed_status] ?? "OK",
              limitationNote: ev.limitation_note,
              spec: evSpec,
              summary: summaries.find((s) => s.compatibility_id === ev.compatibility_id) ?? null,
            }
          : null,
    };
  }

  return {
    record: record.data ?? null,
    symptoms: symptoms.data ?? [],
    measurements: measurements.data ?? [],
    faults: faults.data ?? [],
    actions: actions.data ?? [],
    removedParts: removedParts.data ?? [],
    symptomCodes: symptomCodes.data ?? [],
    partsUsed: partsUsed.data ?? [],
    partCompat,
    canEdit: canEdit.data === true,
    gates: { approvalEnabled, cancelEnabled, approvalMissing },
  };
}
