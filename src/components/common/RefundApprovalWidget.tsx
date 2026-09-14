"use client";

import Link from "next/link";

interface PendingRefund {
  id: string;
  ticket_id: string;
  refund_no: string;
  amount: number;
  reason_code: string;
  refund_method: string;
  requested_at: string;
  receipt_no: string;
  final_price: number;
  customer_name: string;
  device_info: string;
  requester_name: string;
}

interface RefundApprovalWidgetProps {
  refunds: PendingRefund[];
}

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

/**
 * 환불 승인 대기 위젯 (ADMIN/MANAGER 전용)
 * 승인은 접수건 상세의 환불 카드에서 처리한다 — 금액·사유·계좌 정보를 함께 확인해야 하므로
 * 위젯에서는 바로 승인하지 않고 상세로 보낸다.
 */
export default function RefundApprovalWidget({ refunds }: RefundApprovalWidgetProps) {
  if (refunds.length === 0) return null;

  const totalAmount = refunds.reduce((sum, r) => sum + r.amount, 0);

  return (
    <section className="rounded-xl border-2 border-rose-300 bg-rose-50 p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
          {refunds.length}
        </span>
        <h2 className="text-base font-semibold text-gray-900">환불 승인 대기</h2>
        <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
          합계 {totalAmount.toLocaleString()}원
        </span>
      </div>

      <ul className="divide-y divide-rose-200 text-sm">
        {refunds.map((r) => {
          const isFullRefund = r.amount >= r.final_price;
          const requestedDate = new Date(r.requested_at).toLocaleDateString("ko-KR");
          return (
            <li key={r.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/tickets/${r.ticket_id}`}
                    className="text-sm font-semibold text-blue-700 hover:underline"
                  >
                    {r.customer_name}
                  </Link>
                  <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                    {isFullRefund ? "전액" : "부분"}
                  </span>
                  <p className="mt-0.5 font-medium text-gray-800">{r.device_info}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                    <span>접수번호: <span className="font-mono text-gray-700">{r.receipt_no}</span></span>
                    <span>환불번호: <span className="font-mono text-gray-700">{r.refund_no}</span></span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
                    <span>{REASON_LABELS[r.reason_code] ?? r.reason_code}</span>
                    <span>{METHOD_LABELS[r.refund_method] ?? r.refund_method}</span>
                    <span>요청: {r.requester_name} · {requestedDate}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="whitespace-nowrap text-sm font-bold tabular-nums text-rose-700">
                    {r.amount.toLocaleString()}원
                  </p>
                  <Link
                    href={`/tickets/${r.ticket_id}`}
                    className="mt-1 inline-block whitespace-nowrap rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
                  >
                    검토하기
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
