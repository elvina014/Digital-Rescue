import { createClient } from "@/utils/supabase/server";
import type { RepairRecordData } from "./labels";

/**
 * 접수건 상세 페이지용 수리 기록 로더 (세션 클라이언트, RLS 적용).
 * 고객 정보는 포함하지 않는다.
 */
export async function loadRepairRecord(ticketId: string, ticketStatus: string): Promise<RepairRecordData> {
  const supabase = await createClient();

  const [record, symptoms, measurements, faults, actions, removedParts, symptomCodes, partsUsed, canEdit, settings] =
    await Promise.all([
      supabase.from("repair_records").select("*").eq("ticket_id", ticketId).maybeSingle(),
      supabase.from("ticket_symptoms").select("*").eq("ticket_id", ticketId).order("created_at"),
      supabase.from("repair_measurements").select("*").eq("ticket_id", ticketId).order("sort_order").order("created_at"),
      supabase.from("repair_faults").select("*").eq("ticket_id", ticketId).order("sort_order").order("created_at"),
      supabase.from("repair_actions").select("*").eq("ticket_id", ticketId).order("sort_order").order("performed_at"),
      supabase.from("ticket_removed_parts").select("*").eq("ticket_id", ticketId).order("created_at"),
      supabase.from("symptom_codes").select("*").order("sort_order").order("name"),
      supabase.from("repair_parts_used").select("*").eq("ticket_id", ticketId),
      supabase.rpc("repair_record_can_edit", { p_ticket_id: ticketId }),
      supabase.from("global_settings").select("ri_approval_gate_enabled, ri_cancel_gate_enabled").eq("id", true).single(),
    ]);

  const approvalEnabled = settings.data?.ri_approval_gate_enabled ?? false;
  const cancelEnabled = settings.data?.ri_cancel_gate_enabled ?? false;

  // 승인 게이트가 켜져 있고 승인 대기 중일 때만 미충족 항목을 계산한다
  let approvalMissing: string[] = [];
  if (approvalEnabled && ticketStatus === "WAITING_APPROVAL") {
    const { data } = await supabase.rpc("repair_gate_check", { p_ticket_id: ticketId, p_gate: "APPROVAL" });
    approvalMissing = ((data as { missing?: string[] } | null)?.missing ?? []) as string[];
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
    canEdit: canEdit.data === true,
    gates: { approvalEnabled, cancelEnabled, approvalMissing },
  };
}
