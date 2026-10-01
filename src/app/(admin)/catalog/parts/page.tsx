import { createClient } from "@/utils/supabase/server";
import CatalogTabs from "../CatalogTabs";
import { requireAdminPage } from "../requireAdminPage";
import PartsClient from "./PartsClient";
import type { EvidenceRow, PartSpecRow, SummaryRow } from "./types";

export default async function CatalogPartsPage() {
  await requireAdminPage();
  const supabase = await createClient();

  const [specs, groups, summary, evidence] = await Promise.all([
    supabase
      .from("part_specs")
      .select("id, part_type, name, manufacturer, compat_target, interchange_group_id, description, needs_review, part_number_aliases ( id, alias, alias_type )")
      .order("name"),
    supabase.from("interchange_groups").select("id, name").order("name"),
    supabase.from("compatibility_summary").select("*").order("target_label"),
    supabase
      .from("compatibility_evidence")
      .select(
        `id, compatibility_id, kind, observed_status, limitation_note, reference, note, created_at, retracted_at, retract_reason,
         part_compatibility ( part_spec_id ),
         repair_tickets ( receipt_no ),
         employees!compatibility_evidence_created_by_fkey ( name )`
      )
      .order("created_at", { ascending: false }),
  ]);

  const evidenceBySpec = new Map<string, EvidenceRow[]>();
  for (const e of evidence.data ?? []) {
    const specId = (e.part_compatibility as unknown as { part_spec_id: string } | null)?.part_spec_id;
    if (!specId) continue;
    const row: EvidenceRow = {
      id: e.id,
      compatibilityId: e.compatibility_id,
      kind: e.kind,
      observedStatus: e.observed_status,
      limitationNote: e.limitation_note,
      reference: e.reference,
      note: e.note,
      receiptNo: (e.repair_tickets as unknown as { receipt_no: string | null } | null)?.receipt_no ?? null,
      createdByName: (e.employees as unknown as { name: string } | null)?.name ?? "알 수 없음",
      createdAt: e.created_at,
      retractedAt: e.retracted_at,
      retractReason: e.retract_reason,
    };
    evidenceBySpec.set(specId, [...(evidenceBySpec.get(specId) ?? []), row]);
  }

  const summaryRows = (summary.data ?? []) as SummaryRow[];
  const rows: PartSpecRow[] = (specs.data ?? []).map((s) => ({
    id: s.id,
    partType: s.part_type,
    name: s.name,
    manufacturer: s.manufacturer,
    compatTarget: s.compat_target === "BOARD" ? "BOARD" : "MODEL",
    groupId: s.interchange_group_id,
    description: s.description,
    needsReview: s.needs_review,
    aliases: (s.part_number_aliases ?? []).map((a) => ({ id: a.id, alias: a.alias, aliasType: a.alias_type })),
    compat: summaryRows.filter((r) => r.part_spec_id === s.id),
    evidence: evidenceBySpec.get(s.id) ?? [],
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <CatalogTabs active="/catalog/parts" />
      {(specs.error || summary.error || evidence.error) && (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">부품 규격 정보를 불러오지 못했습니다.</p>
      )}
      <PartsClient specs={rows} groups={groups.data ?? []} />
    </div>
  );
}
