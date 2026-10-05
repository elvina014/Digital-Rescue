"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { getPurchaseGuardAction, requestPurchaseWithGuardAction } from "../purchaseGuardActions";
import type { PurchaseGuardInfo, PurchaseResource } from "../purchaseGuardActions";
import { CONDITION_LABELS, NOTE_MAX, REASON_CODES, REASON_LABELS, SOURCE_LABELS, isDonorSource } from "@/components/purchase-guard/labels";

interface Props {
  materialId: string;
  /** 요청 직전 (낙관적 갱신) */
  onSubmitting: () => void;
  /** 실패 시 되돌리기 */
  onFailed: () => void;
  onClose: () => void;
}

/** 구매 요청 전 내부 자원 확인 — 자원이 있으면 구매 사유 필수 (Phase 6) */
export default function PurchaseGuardDialog({ materialId, onSubmitting, onFailed, onClose }: Props) {
  const [info, setInfo] = useState<PurchaseGuardInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const apply = useCallback((res: Awaited<ReturnType<typeof getPurchaseGuardAction>>) => {
    if (res.error) setLoadError(res.error);
    else setInfo(res.data ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPurchaseGuardAction(materialId).then((res) => {
      if (!cancelled) apply(res);
    });
    return () => {
      cancelled = true;
    };
  }, [materialId, apply]);

  const hasResources = (info?.resource_count ?? 0) > 0;
  const stock = info?.resources.filter((r) => !isDonorSource(r.source)) ?? [];
  const donors = info?.resources.filter((r) => isDonorSource(r.source)) ?? [];

  function submit() {
    if (hasResources && !reason) {
      setError("구매 사유를 선택해 주세요.");
      return;
    }
    if (reason === "OTHER" && note.trim().length < 2) {
      setError("기타 사유를 입력해 주세요.");
      return;
    }
    if (note.trim().length > NOTE_MAX) {
      setError(`사유는 ${NOTE_MAX}자 이내로 입력해 주세요.`);
      return;
    }
    setError(null);
    onSubmitting();
    startTransition(async () => {
      const res = await requestPurchaseWithGuardAction(materialId, reason || null, note.trim() || null);
      if (res.error) {
        onFailed();
        setError(res.error);
        if (res.reload) apply(await getPurchaseGuardAction(materialId));
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl">
        <h2 className="text-base font-semibold text-gray-900">구매 요청 전 내부 자원 확인</h2>
        {info && <p className="mt-1 text-sm text-gray-600">{info.item_label} × {info.quantity}</p>}

        {loadError && <p className="mt-4 text-sm text-red-600">{loadError}</p>}
        {!info && !loadError && <p className="mt-4 text-sm text-gray-500">확인 중...</p>}

        {info && !hasResources && (
          <p className="mt-4 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
            {info.excluded ? "외주 품목은 확인 대상이 아닙니다." : "내부 재고·Donor에서 대체 가능한 자원이 없습니다."}
          </p>
        )}

        {info && hasResources && (
          <>
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              재고나 Donor 부품을 사용할 수 있다면 구매 대신 출고/적출을 진행하세요.
            </p>
            <ResourceGroup title="재고" rows={stock} />
            <ResourceGroup title="Donor" rows={donors} />

            <fieldset className="mt-4">
              <legend className="text-sm font-semibold text-gray-800">구매 사유 (필수)</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {REASON_CODES.map((code) => (
                  <label
                    key={code}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm ${
                      reason === code ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"
                    }`}
                  >
                    <input type="radio" name="purchase-reason" value={code} checked={reason === code}
                      onChange={() => setReason(code)} className="sr-only" />
                    {REASON_LABELS[code]}
                  </label>
                ))}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={NOTE_MAX}
                rows={2}
                placeholder={reason === "OTHER" ? "기타 사유를 입력해 주세요." : "메모 (선택)"}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </fieldset>
          </>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isPending}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            닫기
          </button>
          <button type="button" onClick={submit} disabled={isPending || !info}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50">
            {isPending ? "요청 중..." : hasResources ? "사유 기록 후 구매 요청" : "구매 요청"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResourceGroup({ title, rows }: { title: string; rows: PurchaseResource[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <h3 className="text-xs font-semibold text-gray-500">{title} · {rows.length}건</h3>
      <ul className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200 text-sm">
        {rows.map((r) => (
          <li key={r.ref_id} className="px-3 py-2">
            <div className="flex justify-between gap-2">
              <span className="text-gray-800">{r.label}{r.part_name ? ` (${r.part_name})` : ""}</span>
              <span className="whitespace-nowrap tabular-nums text-gray-700">{r.qty}개</span>
            </div>
            <p className="text-xs text-gray-500">
              {SOURCE_LABELS[r.source] ?? r.source}
              {r.condition ? ` · ${CONDITION_LABELS[r.condition] ?? r.condition}` : ""}
              {r.note ? ` · ${r.note}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
