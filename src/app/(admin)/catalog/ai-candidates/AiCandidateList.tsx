"use client";

import Link from "next/link";
import { useState } from "react";
import { useOptimisticRemove } from "../useOptimisticRemove";
import AiCandidateCard from "./AiCandidateCard";

export type CandidateStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface CandidateRow {
  id: string;
  type: "COMPATIBILITY" | "PART_ALIAS";
  specName: string;
  partType: string | null;
  targetType: string | null;
  targetLabel: string | null;
  observedStatus: string | null;
  limitationNote: string | null;
  reference: string | null;
  alias: string | null;
  aliasType: string | null;
  rationale: string | null;
  sourceRef: string | null;
  status: CandidateStatus;
  approvedAs: string | null;
  reviewNote: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

const TABS: { status: CandidateStatus; label: string }[] = [
  { status: "PENDING", label: "검토 대기" },
  { status: "APPROVED", label: "승인" },
  { status: "REJECTED", label: "반려" },
];

/** AI 후보 목록: 상태 탭 + 카드. 검토 대기 목록은 처리 즉시 숨기고, 실패하면 다시 보여준다. */
export default function AiCandidateList({
  status,
  counts,
  candidates,
}: {
  status: CandidateStatus;
  counts: Record<CandidateStatus, number>;
  candidates: CandidateRow[];
}) {
  const { isHidden, remove } = useOptimisticRemove();
  // 실패 메시지는 목록에 둔다: 처리 중 카드가 숨겨졌다가(언마운트) 다시 나타나므로 카드 상태에 두면 사라진다
  const [errors, setErrors] = useState<Record<string, string>>({});
  const visible = candidates.filter((c) => !isHidden(c.id));

  async function resolve(id: string, action: () => Promise<{ error?: string }>) {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    const err = await remove(id, action);
    if (err) setErrors((prev) => ({ ...prev, [id]: err }));
    return err;
  }

  return (
    <div>
      <p className="mb-3 text-sm text-gray-500">
        VECTOR(AI)가 제안한 호환성·부품 별칭입니다. 승인해야 지식으로 등록되며, 승인해도 &lsquo;검증됨&rsquo;이 되지는 않습니다.
      </p>
      <nav className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <Link
            key={t.status}
            href={`/catalog/ai-candidates?status=${t.status}`}
            className={`rounded-full border px-3 py-1 text-sm ${
              t.status === status ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label} {counts[t.status]}
          </Link>
        ))}
      </nav>
      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          {status === "PENDING" ? "검토할 AI 후보가 없습니다." : "해당하는 AI 후보가 없습니다."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((c) => (
            <AiCandidateCard key={c.id} candidate={c} serverError={errors[c.id] ?? null} onResolve={(action) => resolve(c.id, action)} />
          ))}
        </ul>
      )}
    </div>
  );
}
