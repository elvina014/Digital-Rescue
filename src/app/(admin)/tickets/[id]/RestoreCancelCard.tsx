"use client";

import { useState, useTransition } from "react";
import { restoreCanceledTicketAction } from "../actions";

interface RestoreCancelCardProps {
  ticketId: string;
  ticketStatus: string;
  currentEmployee: { id: string; role: string };
  hasAssignee: boolean;
  receivedAt: string | null;
  cancelDisposal: string | null;
  disposeConfirmedAt: string | null;
  /** 반환 확인이 끝나 재고가 이미 복구된 자재 건수 (원복 대상 아님) */
  settledMaterialCount: number;
}

const STATUS_OPTIONS = [
  { value: "NEW", label: "신규 접수", hint: "담당기사 배정 전으로 되돌립니다" },
  { value: "ASSIGNED", label: "배정 완료", hint: "담당기사는 유지, 입고 기록은 해제됩니다" },
  { value: "RECEIVED", label: "입고 완료", hint: "제품이 입고된 상태로 되돌립니다" },
  { value: "IN_PROGRESS", label: "수리 진행", hint: "수리를 진행하던 상태로 되돌립니다" },
] as const;

export default function RestoreCancelCard({
  ticketId,
  ticketStatus,
  currentEmployee,
  hasAssignee,
  receivedAt,
  cancelDisposal,
  disposeConfirmedAt,
  settledMaterialCount,
}: RestoreCancelCardProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState("");
  const [note, setNote] = useState("");

  // 취소된 건에만, 관리자·팀장에게만 노출
  const role = currentEmployee.role;
  if (ticketStatus !== "CANCELED") return null;
  if (role !== "ADMIN" && role !== "MANAGER") return null;

  const isDisposed = !!disposeConfirmedAt;
  // 담당기사가 없으면 배정 이후 상태로 되돌릴 수 없다
  const options = hasAssignee ? STATUS_OPTIONS : STATUS_OPTIONS.filter((o) => o.value === "NEW");
  const wasReturned = cancelDisposal === "RETURN";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const label = STATUS_OPTIONS.find((o) => o.value === targetStatus)?.label ?? targetStatus;
    if (
      !window.confirm(
        `이 접수건을 '${label}' 상태로 되돌립니다.\n\n` +
          `취소 시 삭제된 사진은 복구되지 않습니다.\n계속하시겠습니까?`
      )
    ) {
      return;
    }
    startTransition(async () => {
      setError(null);
      const res = await restoreCanceledTicketAction(ticketId, targetStatus, note);
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        setTargetStatus("");
        setNote("");
      }
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-1 text-base font-semibold text-gray-800">취소 복원</h2>
      <p className="mb-4 text-xs text-gray-500">
        취소된 접수건을 취소 전 상태로 되돌립니다. 관리자 · 팀장만 사용할 수 있습니다.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {isDisposed ? (
        <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          기기 <span className="font-semibold">폐기 확인이 완료</span>된 접수건입니다. 실물이 남아 있지 않으므로
          복원할 수 없습니다. 필요하면 신규 접수로 진행해 주세요.
        </p>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg border border-teal-300 px-4 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50"
        >
          취소 복원하기
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-teal-200 bg-teal-50/40 p-4">
          {/* 복원 전 확인 사항 */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="mb-1 font-semibold">복원 전 확인해 주세요</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>
                취소 시 <span className="font-semibold">업로드된 사진이 영구 삭제</span>되었습니다. 복원해도 돌아오지 않습니다.
              </li>
              {wasReturned && (
                <li>
                  기기를 <span className="font-semibold">고객에게 반환</span>하기로 취소된 건입니다. 실물이 우리 쪽에 있는지
                  먼저 확인해 주세요.
                </li>
              )}
              {settledMaterialCount > 0 && (
                <li>
                  반환 확인이 끝난 자재 {settledMaterialCount}건은 <span className="font-semibold">재고로 이미 복구</span>되어
                  자동으로 되돌리지 않습니다. 필요하면 수리 진행 중에 다시 요청해 주세요.
                </li>
              )}
              <li>복원하면 해당 월 취소율 통계에서 이 건이 제외됩니다.</li>
            </ul>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700">되돌릴 상태</legend>
            {!hasAssignee && (
              <p className="mb-2 text-xs text-gray-500">
                담당기사가 배정되지 않은 건이라 &lsquo;신규 접수&rsquo;로만 복원할 수 있습니다.
              </p>
            )}
            <div className="space-y-2">
              {options.map((opt) => (
                <label
                  key={opt.value}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 bg-white p-2.5 text-sm hover:border-teal-300"
                >
                  <input
                    type="radio"
                    name="targetStatus"
                    value={opt.value}
                    checked={targetStatus === opt.value}
                    onChange={(e) => setTargetStatus(e.target.value)}
                    required
                    className="mt-0.5 accent-teal-600"
                  />
                  <span>
                    <span className="font-medium text-gray-800">{opt.label}</span>
                    <span className="block text-xs text-gray-500">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {receivedAt && (targetStatus === "NEW" || targetStatus === "ASSIGNED") && (
              <p className="mt-1.5 text-xs text-amber-700">
                입고 전 상태로 되돌리므로 입고 기록도 함께 해제됩니다.
              </p>
            )}
          </fieldset>

          <div>
            <label htmlFor="restoreNote" className="mb-1 block text-sm font-medium text-gray-700">
              복원 사유 <span className="text-red-600">(필수)</span>
            </label>
            <textarea
              id="restoreNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              required
              placeholder="예: 고객이 취소를 철회하고 수리를 요청함"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTargetStatus("");
                setNote("");
                setError(null);
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-teal-600 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              복원 실행
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
