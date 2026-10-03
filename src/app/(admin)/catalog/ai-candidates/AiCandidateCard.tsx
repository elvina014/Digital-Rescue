"use client";

import { useState } from "react";
import { ALIAS_TYPE_LABEL, COMPAT_STATUS_CLASS, COMPAT_STATUS_LABEL, PART_TYPE_LABEL } from "@/components/catalog/partLabels";
import { approveAiCandidateAction, rejectAiCandidateAction } from "./actions";
import type { CandidateRow } from "./AiCandidateList";

const APPROVED_AS_LABEL: Record<string, string> = { DOCUMENT: "문서 근거로 승인", INFERENCE: "추정으로 승인" };
const isUrl = (v: string) => /^https?:\/\//i.test(v);

type Mode = null | "document" | "reject";

/** AI 후보 카드 한 장. 내용은 수정할 수 없고 승인(문서 근거 / 추정) 또는 반려(사유 필수)만 한다. */
export default function AiCandidateCard({
  candidate: c,
  serverError,
  onResolve,
}: {
  candidate: CandidateRow;
  serverError: string | null;
  onResolve: (action: () => Promise<{ error?: string }>) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [reference, setReference] = useState(c.reference ?? "");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = c.status === "PENDING";

  async function run(action: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    await onResolve(action); // 실패 시 목록이 serverError로 돌려준다 (이 카드는 그 사이 다시 마운트될 수 있음)
    setBusy(false);
  }

  function approve(approveAs: "DOCUMENT" | "INFERENCE" | null) {
    if (approveAs === "DOCUMENT" && !reference.trim()) return setError("문서 근거로 승인하려면 출처를 입력해 주세요.");
    return run(() => approveAiCandidateAction({ candidateId: c.id, approveAs, reference, note }));
  }

  function reject() {
    if (!reason.trim()) return setError("반려 사유를 입력해 주세요.");
    return run(() => rejectAiCandidateAction(c.id, reason));
  }

  const btn = "rounded border px-3 py-1.5 text-sm disabled:opacity-50";

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-800">
          {c.type === "COMPATIBILITY" ? "호환성" : "부품 별칭"}
        </span>
        <span className="font-semibold text-gray-900">
          {c.partType && <span className="mr-1 text-gray-500">[{PART_TYPE_LABEL[c.partType] ?? c.partType}]</span>}
          {c.specName}
        </span>
        {c.type === "COMPATIBILITY" ? (
          <>
            <span className="text-gray-400">→</span>
            <span className="text-gray-800">{c.targetLabel ?? "(삭제된 대상)"}</span>
            {c.observedStatus && (
              <span className={`rounded px-2 py-0.5 text-xs ${COMPAT_STATUS_CLASS[c.observedStatus] ?? ""}`}>
                {COMPAT_STATUS_LABEL[c.observedStatus] ?? c.observedStatus}
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-800">
            별칭 <strong>{c.alias}</strong> ({ALIAS_TYPE_LABEL[c.aliasType ?? ""] ?? c.aliasType})
          </span>
        )}
        <span className="ml-auto text-xs text-gray-400">제안 {c.createdAt}</span>
      </div>

      <dl className="mt-2 space-y-1 text-sm text-gray-700">
        {c.limitationNote && <div><dt className="inline text-gray-500">제한사항: </dt><dd className="inline">{c.limitationNote}</dd></div>}
        {c.reference && (
          <div>
            <dt className="inline text-gray-500">출처: </dt>
            <dd className="inline break-all">
              {isUrl(c.reference) ? <a href={c.reference} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{c.reference}</a> : c.reference}
            </dd>
          </div>
        )}
        {c.sourceRef && <div className="text-xs text-gray-400">실행 ID: {c.sourceRef}</div>}
      </dl>
      {c.rationale && (
        <details className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <summary className="cursor-pointer text-xs font-semibold">AI 설명 — 사실 확인 필요</summary>
          <p className="mt-1 whitespace-pre-wrap">{c.rationale}</p>
        </details>
      )}

      {!pending && (
        <p className="mt-3 border-t border-gray-100 pt-2 text-sm text-gray-600">
          {c.status === "APPROVED" ? (c.approvedAs ? APPROVED_AS_LABEL[c.approvedAs] : "승인") : "반려"}
          {c.reviewNote && <> · {c.status === "REJECTED" ? "사유" : "메모"}: {c.reviewNote}</>}
          <span className="text-gray-400"> · {c.reviewerName ?? "(퇴사자)"} · {c.reviewedAt}</span>
        </p>
      )}

      {pending && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          {mode === "document" && (
            <div className="flex flex-wrap gap-2">
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="출처 (문서명 또는 URL, 필수)" className="min-w-64 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm" />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="검토 메모 (선택)" className="min-w-48 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm" />
              <button type="button" disabled={busy} onClick={() => approve("DOCUMENT")} className={`${btn} border-green-600 bg-green-600 text-white hover:bg-green-700`}>문서 근거로 승인 확정</button>
            </div>
          )}
          {mode === "reject" && (
            <div className="flex flex-wrap gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="반려 사유 (필수)" className="min-w-64 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm" />
              <button type="button" disabled={busy} onClick={reject} className={`${btn} border-red-600 bg-red-600 text-white hover:bg-red-700`}>반려 확정</button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {c.type === "COMPATIBILITY" ? (
              <>
                <button type="button" disabled={busy} onClick={() => { setMode("document"); setError(null); }} className={`${btn} border-green-600 text-green-700 hover:bg-green-50`}>문서 근거로 승인</button>
                <button type="button" disabled={busy} onClick={() => approve("INFERENCE")} className={`${btn} border-gray-400 text-gray-700 hover:bg-gray-50`}>추정으로 승인</button>
              </>
            ) : (
              <button type="button" disabled={busy} onClick={() => approve(null)} className={`${btn} border-green-600 text-green-700 hover:bg-green-50`}>승인</button>
            )}
            <button type="button" disabled={busy} onClick={() => { setMode("reject"); setError(null); }} className={`${btn} border-red-300 text-red-600 hover:bg-red-50`}>반려</button>
            {mode && <button type="button" onClick={() => { setMode(null); setError(null); }} className={`${btn} border-gray-300 text-gray-500`}>취소</button>}
          </div>
          {(error ?? serverError) && <p className="text-sm text-red-600">{error ?? serverError}</p>}
        </div>
      )}
    </li>
  );
}
