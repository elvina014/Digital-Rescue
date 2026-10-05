import {
  COMPAT_STATUS_CLASS, COMPAT_STATUS_LABEL, CONFIDENCE_LABEL, evidenceCountText,
} from "@/components/catalog/partLabels";

interface Props {
  status: string | null;
  confidence: string | null;
  isCandidate: boolean | null;
  limitationNote: string | null;
  counts: { install_ok: number | null; install_conditional: number | null; install_incompatible: number | null; document_count: number | null };
}

/** 호환 상태 · 신뢰도 · 근거 건수 (Phase 3 라벨 재사용) */
export default function CompatBadge({ status, confidence, isCandidate, limitationNote, counts }: Props) {
  const s = status ?? "unknown";
  const evidence = evidenceCountText({ ...counts, inference_count: 0 });
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className={`rounded-full px-2 py-0.5 font-medium ${COMPAT_STATUS_CLASS[s] ?? ""}`}>{COMPAT_STATUS_LABEL[s] ?? s}</span>
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{CONFIDENCE_LABEL[confidence ?? ""] ?? confidence}</span>
      {isCandidate && <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-800">호환 그룹 후보</span>}
      {evidence && <span className="text-gray-500">({evidence})</span>}
      {limitationNote && <span className="text-amber-700">— {limitationNote}</span>}
    </div>
  );
}
