"use client";

import { useState } from "react";
import { COMPAT_STATUS_LABEL, EVIDENCE_KIND_LABEL } from "@/components/catalog/partLabels";
import { retractEvidenceAction } from "../partActions";
import type { EvidenceRow } from "./types";

/** 한 호환성 행의 근거 이력 — 철회된 근거도 남겨서 보여준다. 철회는 사유 필수. */
export default function EvidenceList({ evidence }: { evidence: EvidenceRow[] }) {
  const [retracting, setRetracting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function handleRetract(id: string) {
    if (!reason.trim()) return setError("철회 사유를 입력해 주세요.");
    setError(null);
    // 낙관적 업데이트: 먼저 철회된 것으로 표시하고, 실패하면 되돌린다
    setHidden((prev) => new Set(prev).add(id));
    const res = await retractEvidenceAction(id, reason);
    if (res.error) {
      setHidden((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      return setError(res.error);
    }
    setRetracting(null);
    setReason("");
  }

  if (evidence.length === 0) return <p className="text-xs text-gray-400">근거가 없습니다.</p>;

  return (
    <ul className="space-y-1">
      {evidence.map((e) => {
        const retracted = !!e.retractedAt || hidden.has(e.id);
        return (
          <li key={e.id} className={`rounded border border-gray-100 px-2 py-1.5 text-xs ${retracted ? "bg-gray-50 text-gray-400 line-through" : "text-gray-700"}`}>
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-semibold">{EVIDENCE_KIND_LABEL[e.kind] ?? e.kind}</span>
              <span>{COMPAT_STATUS_LABEL[e.observedStatus] ?? e.observedStatus}</span>
              {e.limitationNote && <span>· {e.limitationNote}</span>}
              {e.reference && <span>· 출처: {e.reference}</span>}
              {e.note && <span>· {e.note}</span>}
              {e.receiptNo && <span>· 접수 {e.receiptNo}</span>}
              <span className="text-gray-400">· {e.createdByName} · {e.createdAt.slice(0, 10)}</span>
              {!retracted && retracting !== e.id && (
                <button type="button" onClick={() => { setRetracting(e.id); setReason(""); setError(null); }} className="ml-auto text-gray-400 no-underline hover:text-red-600">
                  철회
                </button>
              )}
            </div>
            {e.retractedAt && e.retractReason && <p className="mt-0.5 no-underline">철회 사유: {e.retractReason}</p>}
            {retracting === e.id && !retracted && (
              <div className="mt-1 flex gap-2">
                <input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="철회 사유" className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs" />
                <button type="button" onClick={() => handleRetract(e.id)} className="rounded border border-red-200 px-2 py-1 text-red-600 hover:bg-red-50">철회 확정</button>
                <button type="button" onClick={() => setRetracting(null)} className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-100">취소</button>
              </div>
            )}
          </li>
        );
      })}
      {error && <li className="text-xs text-red-600">{error}</li>}
    </ul>
  );
}
