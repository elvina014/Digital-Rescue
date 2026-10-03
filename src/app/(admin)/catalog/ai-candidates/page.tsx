import { createClient } from "@/utils/supabase/server";
import CatalogTabs from "../CatalogTabs";
import { requireAdminPage } from "../requireAdminPage";
import AiCandidateList from "./AiCandidateList";
import type { CandidateRow, CandidateStatus } from "./AiCandidateList";

const STATUSES: CandidateStatus[] = ["PENDING", "APPROVED", "REJECTED"];

type Named = { name: string } | null;
type ModelRef = { name: string; catalog_brands: Named } | null;

function modelLabel(m: ModelRef, variant?: string | null) {
  return [m?.catalog_brands?.name, m?.name, variant].filter(Boolean).join(" ");
}

function formatTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });
}

/** 기기 마스터 → AI 후보 (Phase 8): VECTOR가 제안한 호환성·부품 별칭을 관리자가 검토한다. */
export default async function AiCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  const status: CandidateStatus = STATUSES.includes(params.status as CandidateStatus) ? (params.status as CandidateStatus) : "PENDING";
  const supabase = await createClient();

  const [list, ...counts] = await Promise.all([
    supabase
      .from("ai_candidates")
      .select(
        `id, candidate_type, target_type, observed_status, limitation_note, reference, alias, alias_type, rationale, source_ref,
         status, approved_as, review_note, reviewed_at, created_at,
         part_specs ( name, part_type ),
         catalog_models ( name, catalog_brands ( name ) ),
         catalog_variants ( name, catalog_models ( name, catalog_brands ( name ) ) ),
         catalog_boards ( board_number ),
         employees!ai_candidates_reviewed_by_fkey ( name )`
      )
      .eq("status", status)
      .order(status === "PENDING" ? "created_at" : "reviewed_at", { ascending: status === "PENDING" })
      .limit(200),
    ...STATUSES.map((s) => supabase.from("ai_candidates").select("id", { count: "exact", head: true }).eq("status", s)),
  ]);

  const candidates: CandidateRow[] = (list.data ?? []).map((c) => {
    const variant = c.catalog_variants as unknown as { name: string; catalog_models: ModelRef } | null;
    const target =
      c.target_type === "MODEL" ? modelLabel(c.catalog_models as unknown as ModelRef)
      : c.target_type === "VARIANT" ? modelLabel(variant?.catalog_models ?? null, variant?.name)
      : c.target_type === "BOARD" ? (c.catalog_boards as unknown as { board_number: string } | null)?.board_number ?? null
      : null;
    const spec = c.part_specs as unknown as { name: string; part_type: string } | null;
    return {
      id: c.id,
      type: c.candidate_type as CandidateRow["type"],
      specName: spec?.name ?? "(삭제된 규격)",
      partType: spec?.part_type ?? null,
      targetType: c.target_type,
      targetLabel: target,
      observedStatus: c.observed_status,
      limitationNote: c.limitation_note,
      reference: c.reference,
      alias: c.alias,
      aliasType: c.alias_type,
      rationale: c.rationale,
      sourceRef: c.source_ref,
      status: c.status as CandidateStatus,
      approvedAs: c.approved_as,
      reviewNote: c.review_note,
      reviewerName: (c.employees as unknown as Named)?.name ?? null,
      reviewedAt: formatTime(c.reviewed_at),
      createdAt: formatTime(c.created_at) ?? "",
    };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <CatalogTabs active="/catalog/ai-candidates" />
      {list.error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">AI 후보를 불러오지 못했습니다.</p>}
      <AiCandidateList
        status={status}
        counts={{ PENDING: counts[0].count ?? 0, APPROVED: counts[1].count ?? 0, REJECTED: counts[2].count ?? 0 }}
        candidates={candidates}
      />
    </div>
  );
}
