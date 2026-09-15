"use client";

import { useState, useTransition } from "react";
import {
  requestRefundAction,
  approveRefundAction,
  rejectRefundAction,
  completeRefundAction,
  voidRefundAction,
} from "../actions";
import { formatDateTime } from "@/lib/date";
import type { RefundMaterialAdjustment } from "@/types/database";

// ─── 타입 ───

export interface RefundRow {
  id: string;
  refund_no: string;
  amount: number;
  deduction_amount: number;
  deduction_note: string | null;
  reason_code: string;
  reason_note: string | null;
  refund_method: string;
  refund_bank: string | null;
  refund_account: string | null;
  refund_holder: string | null;
  cash_receipt_cancel_required: boolean;
  cash_receipt_canceled_at: string | null;
  parts_recovery: string;
  material_adjustments: RefundMaterialAdjustment[];
  status: string;
  reject_note: string | null;
  void_note: string | null;
  requested_at: string;
  requested_by: string;
  requester_name: string;
  approver_name: string | null;
  completed_at: string | null;
  completer_name: string | null;
}

/** 환불 폼에서 쓰는 재고 자재 필드 (TicketMaterialRow의 부분집합) */
interface RefundMaterial {
  id: string;
  quantity: number;
  request_status: string;
  category_name: string;
  spec_name: string;
  product_name: string;
  capacity: string | null;
  base_estimate: number;
  override_unit_price: number | null;
}

interface RefundCardProps {
  ticketId: string;
  ticketStatus: string;
  finalPrice: number;
  paymentMethod: string | null;
  cashReceiptIssued: boolean | null;
  /** 완료 후 경과 일수 (서버에서 계산 — 렌더 중 Date.now() 호출 금지) */
  daysSinceCompleted: number;
  currentEmployee: { id: string; role: string };
  refunds: RefundRow[];
  /** 수동 입력 자재비 (material_cost_details) — 배열 순서가 RPC의 index와 일치해야 한다 */
  manualCosts: { description: string; amount: number }[];
  materials: RefundMaterial[];
}

/** 자재비 수정 입력 상태. key: "manual:{index}" | "material:{id}" */
type AdjustmentDraft = Record<string, { after?: number | "" }>;

// ─── 라벨 ───

const REASON_LABELS: Record<string, string> = {
  QUALITY: "수리 품질 하자",
  REPAIR_FAILED: "수리 실패",
  OVERCHARGE: "과다·오청구",
  DUPLICATE: "중복 결제",
  COMPLAINT: "고객 불만",
  CHANGE_MIND: "고객 단순 변심",
  OTHER: "기타",
};

const METHOD_LABELS: Record<string, string> = {
  CARD_CANCEL: "카드 승인취소",
  CARD_PARTIAL_CANCEL: "카드 부분취소",
  BANK_REFUND: "계좌 송금",
  CASH: "현금 반환",
};

// 042 이전 환불 기록 표시용
const PARTS_LABELS: Record<string, string> = {
  RECOVERED: "부품 회수함",
  NOT_RECOVERED: "부품 회수 안 함",
};

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  REQUESTED: { label: "승인 대기", className: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "승인됨 · 처리 대기", className: "bg-blue-100 text-blue-800" },
  COMPLETED: { label: "환불 완료", className: "bg-rose-100 text-rose-800" },
  REJECTED: { label: "반려됨", className: "bg-gray-200 text-gray-600" },
  VOID: { label: "무효처리", className: "bg-gray-200 text-gray-500" },
};

// 실물이 없는 재고 자재 — 회수 대신 금액을 수정한다 (RPC와 동일 기준)
function isNonPhysical(m: RefundMaterial) {
  return m.spec_name === "외주" || m.category_name === "소프트웨어";
}

function materialLabel(m: RefundMaterial) {
  return [m.category_name, m.spec_name, m.product_name, m.capacity].filter(Boolean).join(" / ");
}

function unitPriceOf(m: RefundMaterial) {
  return m.override_unit_price ?? m.base_estimate;
}

function won(n: number) {
  return `${n.toLocaleString()}원`;
}

function describeAdjustment(a: RefundMaterialAdjustment) {
  switch (a.kind) {
    case "manual":
      return `${a.description} ${won(a.before)} → ${won(a.after)}`;
    case "inventory_price":
      return `${a.label}${a.quantity > 1 ? ` ×${a.quantity}` : ""} 단가 ${won(a.before_unit)} → ${won(a.after_unit)}`;
    case "inventory_recover":
      return `${a.label}${a.quantity > 1 ? ` ×${a.quantity}` : ""} 회수 (${won(a.unit_price * a.quantity)} 제외)`;
  }
}

export default function RefundCard({
  ticketId,
  ticketStatus,
  finalPrice,
  paymentMethod,
  cashReceiptIssued,
  daysSinceCompleted,
  currentEmployee,
  refunds,
  manualCosts,
  materials,
}: RefundCardProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // 반려/무효처리 사유 입력 대상
  const [noteTarget, setNoteTarget] = useState<{ id: string; action: "REJECT" | "VOID" } | null>(null);
  const [note, setNote] = useState("");

  // 요청 폼 입력값
  const [amount, setAmount] = useState<number | "">("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const [refundMethod, setRefundMethod] = useState("");
  const [refundBank, setRefundBank] = useState("");
  const [refundAccount, setRefundAccount] = useState("");
  const [refundHolder, setRefundHolder] = useState("");
  const [adjustments, setAdjustments] = useState<AdjustmentDraft>({});

  // 완료 건에만 노출
  if (ticketStatus !== "COMPLETED") return null;

  const role = currentEmployee.role;
  const isAdmin = role === "ADMIN";
  const canRequest = isAdmin || role === "MANAGER" || role === "CS";
  const canApprove = isAdmin || role === "MANAGER";
  const canComplete = canApprove || role === "CS";

  // 처리 중(요청·승인) 건도 한도에 포함한다 — RPC와 동일한 기준
  const committed = refunds
    .filter((r) => ["REQUESTED", "APPROVED", "COMPLETED"].includes(r.status))
    .reduce((sum, r) => sum + r.amount, 0);
  const completedTotal = refunds
    .filter((r) => r.status === "COMPLETED")
    .reduce((sum, r) => sum + r.amount, 0);
  const available = finalPrice - committed;
  const isSettled = completedTotal >= finalPrice && finalPrice > 0;

  // 완료 후 30일이 지나면 관리자만 요청 가능
  const isOverdue = daysSinceCompleted > 30;

  // 결제수단별 환불 방법 옵션
  const isCardPayment = paymentMethod === "CARD" || paymentMethod === "E_PAYMENT";
  const methodOptions = isCardPayment
    ? ["CARD_CANCEL", "CARD_PARTIAL_CANCEL"]
    : ["BANK_REFUND", "CASH"];

  const needsBankFields = refundMethod === "BANK_REFUND";

  // ── 자재비 내역 ──
  // 자재비 합계에 들어가는 재고 자재 (recalc_ticket_material_cost와 동일 기준)
  const costedMaterials = materials.filter(
    (m) => m.request_status === "approved" || m.request_status === "cancel_requested"
  );
  // 수정 가능한 재고 자재는 사용 확정(approved) 건만
  const editableMaterials = materials.filter((m) => m.request_status === "approved");
  const currentMaterialTotal =
    manualCosts.reduce((s, c) => s + c.amount, 0) +
    costedMaterials.reduce((s, m) => s + unitPriceOf(m) * m.quantity, 0);

  // 자재비 수정이 걸린 다른 환불이 처리 중이면 새 수정안을 받지 않는다 (RPC와 동일)
  const hasPendingAdjustment = refunds.some(
    (r) => ["REQUESTED", "APPROVED"].includes(r.status) && r.material_adjustments.length > 0
  );

  // 수정 후 자재비 합계 (입력 중인 값 기준 미리보기)
  let adjustedMaterialTotal = currentMaterialTotal;
  manualCosts.forEach((c, i) => {
    const d = adjustments[`manual:${i}`];
    if (d && d.after !== "" && d.after !== undefined) adjustedMaterialTotal -= c.amount - d.after;
  });
  editableMaterials.forEach((m) => {
    const d = adjustments[`material:${m.id}`];
    if (!d) return;
    if (isNonPhysical(m)) {
      if (d.after !== "" && d.after !== undefined) adjustedMaterialTotal -= (unitPriceOf(m) - d.after) * m.quantity;
    } else {
      adjustedMaterialTotal -= unitPriceOf(m) * m.quantity;
    }
  });

  const refundAmountNum = amount === "" ? 0 : Number(amount);
  const netAfterRefund = finalPrice - committed - refundAmountNum;

  function run(fn: () => Promise<{ error?: string } | undefined>, onDone?: () => void) {
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (res?.error) setError(res.error);
      else onDone?.();
    });
  }

  function resetForm() {
    setShowForm(false);
    setAmount("");
    setReasonCode("");
    setReasonNote("");
    setRefundMethod("");
    setRefundBank("");
    setRefundAccount("");
    setRefundHolder("");
    setAdjustments({});
  }

  function toggleAdjustment(key: string, withAmount: boolean) {
    setAdjustments((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = withAmount ? { after: 0 } : {};
      return next;
    });
  }

  function setAdjustmentAmount(key: string, value: string) {
    setAdjustments((prev) => ({ ...prev, [key]: { after: value === "" ? "" : Number(value) } }));
  }

  /** 입력 상태 → 서버 액션 입력. 검증 실패 시 에러 메시지 문자열 */
  function buildAdjustments() {
    const out: NonNullable<Parameters<typeof requestRefundAction>[0]["materialAdjustments"]> = [];
    for (let i = 0; i < manualCosts.length; i++) {
      const d = adjustments[`manual:${i}`];
      if (!d) continue;
      if (d.after === "" || d.after === undefined || d.after < 0 || d.after >= manualCosts[i].amount) {
        return `"${manualCosts[i].description}"은(는) 0원 이상, 현재 금액(${won(manualCosts[i].amount)})보다 낮게 입력해 주세요.`;
      }
      out.push({ kind: "manual", index: i, after: d.after });
    }
    for (const m of editableMaterials) {
      const d = adjustments[`material:${m.id}`];
      if (!d) continue;
      if (isNonPhysical(m)) {
        if (d.after === "" || d.after === undefined || d.after < 0 || d.after >= unitPriceOf(m)) {
          return `"${materialLabel(m)}"은(는) 0원 이상, 현재 단가(${won(unitPriceOf(m))})보다 낮게 입력해 주세요.`;
        }
        out.push({ kind: "inventory_price", material_id: m.id, after: d.after });
      } else {
        out.push({ kind: "inventory_recover", material_id: m.id });
      }
    }
    return out;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const built = buildAdjustments();
    if (typeof built === "string") {
      setError(built);
      return;
    }
    const adjustNote =
      built.length > 0
        ? `\n\n자재비 ${won(currentMaterialTotal)} → ${won(adjustedMaterialTotal)} (환불 완료 시 반영)`
        : "";
    if (!window.confirm(`환불을 요청하시겠습니까? 승인 후 실제 환불 처리가 진행됩니다.${adjustNote}`)) return;
    run(
      () =>
        requestRefundAction({
          ticketId,
          amount: Number(amount),
          reasonCode,
          refundMethod,
          reasonNote: reasonNote.trim() || undefined,
          refundBank: needsBankFields ? refundBank.trim() : undefined,
          refundAccount: needsBankFields ? refundAccount.trim() : undefined,
          refundHolder: needsBankFields ? refundHolder.trim() : undefined,
          materialAdjustments: built,
        }),
      resetForm
    );
  }

  function handleComplete(refund: RefundRow) {
    const adjustNote =
      refund.material_adjustments.length > 0 ? "\n자재비 수정 내역도 이 시점에 반영됩니다." : "";
    if (refund.cash_receipt_cancel_required) {
      if (!window.confirm(`현금영수증 발급취소를 완료하셨습니까?\n확인을 누르면 취소 완료로 기록됩니다.${adjustNote}`)) return;
    } else if (!window.confirm(`실제 환불 처리(송금·승인취소)가 완료되었습니까?\n이 시점에 매출에서 차감됩니다.${adjustNote}`)) {
      return;
    }
    run(() => completeRefundAction(refund.id, refund.cash_receipt_cancel_required));
  }

  function handleNoteSubmit() {
    if (!noteTarget) return;
    const target = noteTarget;
    const text = note.trim();
    if (!text) {
      setError(target.action === "REJECT" ? "반려 사유를 입력해 주세요." : "무효처리 사유를 입력해 주세요.");
      return;
    }
    run(
      () =>
        target.action === "REJECT"
          ? rejectRefundAction(target.id, text)
          : voidRefundAction(target.id, text),
      () => {
        setNoteTarget(null);
        setNote("");
      }
    );
  }

  const inputClass =
    "w-28 rounded border border-gray-300 px-2 py-1 text-right text-xs tabular-nums focus:border-rose-500 focus:outline-none";

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800">환불</h2>
        {completedTotal > 0 && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
            {isSettled ? "전액 환불" : "부분 환불"} {completedTotal.toLocaleString()}원
          </span>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* 금액 요약 */}
      <dl className="mb-4 grid gap-x-8 gap-y-3 rounded-lg bg-gray-50 p-3 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium text-gray-500">결제 금액</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
            {finalPrice.toLocaleString()}원
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500">환불액</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-rose-700">
            {completedTotal > 0 ? `-${completedTotal.toLocaleString()}원` : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-gray-500">실매출</dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums text-gray-900">
            {(finalPrice - completedTotal).toLocaleString()}원
          </dd>
        </div>
      </dl>

      {/* 현금영수증 미확인 경고 (기능 도입 이전 완료 건) */}
      {paymentMethod === "BANK_TRANSFER" && cashReceiptIssued === null && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          이 접수건은 현금영수증 발급 여부가 기록되어 있지 않습니다. 환불 전에 홈택스에서 직접 확인한 뒤,
          발급 건이라면 발급취소를 함께 처리해 주세요.
        </p>
      )}

      {/* 환불 이력 */}
      {refunds.length > 0 && (
        <ul className="mb-4 divide-y divide-gray-100 border-t border-gray-100">
          {refunds.map((r) => {
            const style = STATUS_STYLES[r.status] ?? { label: r.status, className: "bg-gray-100 text-gray-600" };
            const isVoided = r.status === "VOID" || r.status === "REJECTED";
            return (
              <li key={r.id} className={`py-3 ${isVoided ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-gray-700">{r.refund_no}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${style.className}`}>
                    {style.label}
                  </span>
                  <span className="ml-auto text-sm font-semibold tabular-nums text-gray-900">
                    {r.amount.toLocaleString()}원
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                  <span>{REASON_LABELS[r.reason_code] ?? r.reason_code}</span>
                  <span>{METHOD_LABELS[r.refund_method] ?? r.refund_method}</span>
                  {PARTS_LABELS[r.parts_recovery] && <span>{PARTS_LABELS[r.parts_recovery]}</span>}
                  {r.deduction_amount > 0 && <span>공제 {r.deduction_amount.toLocaleString()}원</span>}
                </div>

                {r.reason_note && <p className="mt-1 text-xs text-gray-600">사유: {r.reason_note}</p>}
                {r.deduction_note && <p className="mt-0.5 text-xs text-gray-600">공제 사유: {r.deduction_note}</p>}
                {r.material_adjustments.length > 0 && (
                  <div className="mt-1 text-xs text-gray-600">
                    <span>
                      자재비 수정
                      {r.status === "COMPLETED" ? " (반영됨)" : ["REQUESTED", "APPROVED"].includes(r.status) ? " (환불 완료 시 반영)" : " (미반영)"}:
                    </span>
                    <ul className="ml-3 list-disc pl-3">
                      {r.material_adjustments.map((a, i) => (
                        <li key={i}>{describeAdjustment(a)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.refund_bank && (
                  <p className="mt-0.5 text-xs text-gray-600">
                    환불 계좌: {r.refund_bank} {r.refund_account} ({r.refund_holder})
                  </p>
                )}
                {r.cash_receipt_cancel_required && (
                  <p className="mt-0.5 text-xs text-amber-700">
                    현금영수증 발급건 — {r.cash_receipt_canceled_at ? "발급취소 확인 완료" : "발급취소 필요"}
                  </p>
                )}
                {r.reject_note && <p className="mt-0.5 text-xs text-gray-600">반려 사유: {r.reject_note}</p>}
                {r.void_note && <p className="mt-0.5 text-xs text-gray-600">무효처리 사유: {r.void_note}</p>}

                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-gray-400">
                  <span>요청: {r.requester_name} · {formatDateTime(r.requested_at)}</span>
                  {r.approver_name && <span>승인: {r.approver_name}</span>}
                  {r.completed_at && <span>완료: {r.completer_name} · {formatDateTime(r.completed_at)}</span>}
                </div>

                {/* 사유 입력 (반려/무효처리) */}
                {noteTarget?.id === r.id ? (
                  <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder={noteTarget.action === "REJECT" ? "반려 사유" : "무효처리 사유"}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-gray-500 focus:outline-none"
                    />
                    <div className="mt-1.5 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => { setNoteTarget(null); setNote(""); }}
                        className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={handleNoteSubmit}
                        className="rounded bg-gray-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                      >
                        확인
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.status === "REQUESTED" && canApprove && (
                      <>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            if (!window.confirm(`환불 ${r.amount.toLocaleString()}원을 승인하시겠습니까?`)) return;
                            run(() => approveRefundAction(r.id));
                          }}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          승인
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => { setNoteTarget({ id: r.id, action: "REJECT" }); setNote(""); }}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          반려
                        </button>
                      </>
                    )}
                    {r.status === "APPROVED" && canComplete && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleComplete(r)}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                      >
                        환불 완료 처리
                      </button>
                    )}
                    {(r.status === "APPROVED" || r.status === "COMPLETED") && isAdmin && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => { setNoteTarget({ id: r.id, action: "VOID" }); setNote(""); }}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        무효처리
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 종결 안내 — 환불 완료 건은 재요청을 받지 않는다 */}
      {isSettled ? (
        <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          전액 환불이 완료되어 <span className="font-semibold">거래가 종결</span>되었습니다.
          환불된 건의 재수리·재접수 요청은 받지 않습니다.
        </p>
      ) : canRequest && !showForm ? (
        <div>
          {isOverdue && !isAdmin && (
            <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              완료 후 {daysSinceCompleted}일이 지난 접수건입니다. 관리자만 환불을 요청할 수 있습니다.
            </p>
          )}
          <button
            type="button"
            disabled={isOverdue && !isAdmin}
            onClick={() => { setShowForm(true); setAmount(available > 0 ? available : ""); }}
            className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            환불 요청
          </button>
          <p className="mt-1.5 text-xs text-gray-500">
            환불 가능액 <span className="font-semibold tabular-nums">{available.toLocaleString()}원</span>
            {committed > completedTotal && " (처리 중인 요청 제외)"}
          </p>
        </div>
      ) : null}

      {/* 환불 요청 폼 */}
      {canRequest && showForm && !isSettled && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-rose-200 bg-rose-50/40 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="refundAmount" className="mb-1 block text-sm font-medium text-gray-700">
                환불 금액 (원)
              </label>
              <input
                id="refundAmount"
                type="number"
                min={1}
                max={available}
                value={amount}
                onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              />
              <p className="mt-1 text-xs text-gray-500">최대 {available.toLocaleString()}원</p>
            </div>

            <div>
              <label htmlFor="refundReason" className="mb-1 block text-sm font-medium text-gray-700">
                환불 사유
              </label>
              <select
                id="refundReason"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
              >
                <option value="">선택해 주세요</option>
                {Object.entries(REASON_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="refundReasonNote" className="mb-1 block text-sm font-medium text-gray-700">
              상세 사유 {reasonCode === "OTHER" && <span className="text-rose-600">(필수)</span>}
            </label>
            <textarea
              id="refundReasonNote"
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              rows={2}
              required={reasonCode === "OTHER"}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
            />
          </div>

          {/* 환불 방법 — 원 결제수단에 따라 선택지가 제한된다 */}
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700">
              환불 방법
              <span className="ml-1 text-xs font-normal text-gray-500">
                (원 결제: {paymentMethod === "CARD" ? "카드결제" : paymentMethod === "BANK_TRANSFER" ? "계좌이체" : paymentMethod === "E_PAYMENT" ? "간편결제" : "-"})
              </span>
            </legend>
            <div className="flex flex-wrap gap-4">
              {methodOptions.map((value) => (
                <label key={value} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="refundMethod"
                    value={value}
                    checked={refundMethod === value}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    required
                    className="accent-rose-500"
                  />
                  {METHOD_LABELS[value]}
                </label>
              ))}
            </div>
            {refundMethod === "CARD_CANCEL" && amount !== "" && Number(amount) !== finalPrice && (
              <p className="mt-1 text-xs text-rose-600">
                승인취소(전액)는 결제 전액({finalPrice.toLocaleString()}원)을 환불할 때만 선택할 수 있습니다.
                부분 환불은 부분취소를 선택해 주세요.
              </p>
            )}
          </fieldset>

          {/* 계좌 정보 — 계좌 송금일 때만 */}
          {needsBankFields && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="refundBank" className="mb-1 block text-sm font-medium text-gray-700">은행</label>
                <input
                  id="refundBank" type="text" value={refundBank} required
                  onChange={(e) => setRefundBank(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="refundAccount" className="mb-1 block text-sm font-medium text-gray-700">계좌번호</label>
                <input
                  id="refundAccount" type="text" value={refundAccount} required
                  onChange={(e) => setRefundAccount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-rose-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="refundHolder" className="mb-1 block text-sm font-medium text-gray-700">예금주</label>
                <input
                  id="refundHolder" type="text" value={refundHolder} required
                  onChange={(e) => setRefundHolder(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* 자재비 내역 수정 */}
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-gray-700">자재비 내역 수정</legend>
            <p className="mb-2 text-xs text-gray-500">
              수정할 항목만 체크하세요. 수정 내용은 환불이 <span className="font-semibold">완료 처리될 때</span> 자재비에 반영됩니다.
            </p>

            {hasPendingAdjustment ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                자재비 수정이 포함된 다른 환불이 처리 중입니다. 먼저 완료하거나 반려한 뒤 수정할 수 있습니다.
              </p>
            ) : manualCosts.length === 0 && editableMaterials.length === 0 ? (
              <p className="text-xs text-gray-400">수정할 자재비 항목이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white text-sm">
                {manualCosts.map((c, i) => {
                  const key = `manual:${i}`;
                  const d = adjustments[key];
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!d}
                          onChange={() => toggleAdjustment(key, true)}
                          className="accent-rose-500"
                        />
                        <span className="truncate text-gray-700">{c.description}</span>
                      </label>
                      <span className={`tabular-nums text-xs ${d ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {won(c.amount)}
                      </span>
                      {d && (
                        <input
                          type="number"
                          min={0}
                          max={c.amount - 1}
                          value={d.after ?? ""}
                          onChange={(e) => setAdjustmentAmount(key, e.target.value)}
                          aria-label={`${c.description} 수정 금액`}
                          className={inputClass}
                        />
                      )}
                    </li>
                  );
                })}

                {editableMaterials.map((m) => {
                  const key = `material:${m.id}`;
                  const d = adjustments[key];
                  const nonPhysical = isNonPhysical(m);
                  const unit = unitPriceOf(m);
                  return (
                    <li key={key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!d}
                          onChange={() => toggleAdjustment(key, nonPhysical)}
                          className="accent-rose-500"
                        />
                        <span className="truncate text-gray-700">
                          {materialLabel(m)}
                          {m.quantity > 1 && <span className="ml-1 text-gray-400">×{m.quantity}</span>}
                        </span>
                        <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                          {nonPhysical ? "금액 수정" : "회수"}
                        </span>
                      </label>
                      <span className={`tabular-nums text-xs ${d ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {won(unit * m.quantity)}
                      </span>
                      {d && nonPhysical && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          단가
                          <input
                            type="number"
                            min={0}
                            max={unit - 1}
                            value={d.after ?? ""}
                            onChange={(e) => setAdjustmentAmount(key, e.target.value)}
                            aria-label={`${materialLabel(m)} 수정 단가`}
                            className={inputClass}
                          />
                        </span>
                      )}
                      {d && !nonPhysical && (
                        <span className="text-xs text-rose-700">회수 → 반환 확인 후 재고 복구</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* 처리 결과 미리보기 */}
            <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-lg bg-white p-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-gray-500">환불 금액</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-rose-700">{won(refundAmountNum)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">환불 후 결제금액</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-gray-900">{won(netAfterRefund)}</dd>
              </div>
              <div>
                <dt className="text-gray-500">자재비</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-gray-900">
                  {adjustedMaterialTotal !== currentMaterialTotal ? (
                    <>
                      <span className="text-gray-400 line-through">{won(currentMaterialTotal)}</span>{" "}
                      {won(adjustedMaterialTotal)}
                    </>
                  ) : (
                    won(currentMaterialTotal)
                  )}
                </dd>
              </div>
            </dl>
          </fieldset>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              환불 요청
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
