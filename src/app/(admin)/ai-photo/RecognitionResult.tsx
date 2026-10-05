import { SKIP_REASON_LABEL } from "./labels";
import type { RecognitionResult as Result } from "./labels";

/** 인식 결과: 새 후보 / 이미 검토 대기 중 / 제외된 판독(사유) */
export default function RecognitionResult({ result }: { result: Result }) {
  const created = result.created.filter((c) => !c.duplicate);
  const duplicates = result.created.filter((c) => c.duplicate);

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 text-sm">
      <p className="font-semibold text-gray-900">
        {created.length > 0 ? `후보 ${created.length}건을 올렸습니다 — 관리자 검토 대기` : "새로 올린 후보가 없습니다."}
      </p>
      {created.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {created.map((c) => (
            <li key={c.candidateId} className="rounded-full bg-green-100 px-3 py-1 text-green-900">{c.alias}</li>
          ))}
        </ul>
      )}
      {duplicates.length > 0 && (
        <p className="text-gray-600">이미 검토 대기 중: {duplicates.map((c) => c.alias).join(", ")}</p>
      )}
      {result.skipped.length > 0 && (
        <div>
          <p className="mb-1 text-gray-500">제외된 항목</p>
          <ul className="space-y-1">
            {result.skipped.map((s, i) => (
              <li key={i} className="text-gray-700">
                <span className="font-mono">{s.text}</span>
                <span className="text-gray-500"> — {SKIP_REASON_LABEL[s.reason] ?? s.reason}{s.detail && ` (${s.detail})`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!result.requestId && <p className="text-xs text-gray-400">새 후보가 없어 사진은 저장하지 않았습니다.</p>}
    </div>
  );
}
