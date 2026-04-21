"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { approveMaterialDispatchAction, rejectMaterialDispatchAction } from "@/app/(admin)/tickets/actions";

interface MaterialRequest {
  id: string;
  ticket_id: string;
  quantity: number;
  created_at: string;
  category_name: string;
  spec_name: string;
  product_name: string;
  capacity: string | null;
  base_estimate: number;
  customer_name: string;
  device_info: string;
  technician_name: string;
  request_type: string;
}

interface MaterialDispatchWidgetProps {
  requests: MaterialRequest[];
}

export default function MaterialDispatchWidget({ requests: initialRequests }: MaterialDispatchWidgetProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) return null;

  const dispatchRequests = requests.filter((r) => r.request_type !== "purchase");
  const purchaseRequests = requests.filter((r) => r.request_type === "purchase");

  function handleApprove(materialId: string) {
    startTransition(async () => {
      setError(null);
      const res = await approveMaterialDispatchAction(materialId);
      if (res?.error) {
        setError(res.error);
      } else {
        setRequests((prev) => prev.filter((r) => r.id !== materialId));
      }
    });
  }

  function handleReject(materialId: string) {
    startTransition(async () => {
      setError(null);
      const res = await rejectMaterialDispatchAction(materialId);
      if (res?.error) {
        setError(res.error);
      } else {
        setRequests((prev) => prev.filter((r) => r.id !== materialId));
      }
    });
  }

  function renderList(items: MaterialRequest[], label: string, borderColor: string, bgColor: string, badgeBg: string, badgeText: string, btnBg: string, btnHover: string, btnLabel: string, rejectLabel: string) {
    if (items.length === 0) return null;
    return (
      <section className={`rounded-xl border-2 ${borderColor} ${bgColor} p-5`}>
        <div className="mb-3 flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full ${badgeBg} text-xs font-bold ${badgeText}`}>
            {items.length}
          </span>
          <h2 className="text-base font-semibold text-gray-900">{label}</h2>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>
        )}

        <ul className="divide-y divide-gray-200 text-sm">
          {items.map((r) => {
            const itemLabel = [r.category_name, r.spec_name, r.product_name, r.capacity].filter(Boolean).join(" / ");
            const subtotal = r.base_estimate * r.quantity;
            return (
              <li key={r.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/tickets/${r.ticket_id}`}
                      className="text-sm font-medium text-blue-700 hover:underline"
                    >
                      {r.customer_name} — {r.device_info}
                    </Link>
                    <p className="mt-0.5 text-gray-600">{itemLabel} × {r.quantity}</p>
                    <p className="text-xs text-gray-500">
                      요청자: <span className="font-medium text-gray-700">{r.technician_name}</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      {subtotal.toLocaleString()}원 · {new Date(r.created_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleReject(r.id)}
                      className="whitespace-nowrap rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      {rejectLabel}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleApprove(r.id)}
                      className={`whitespace-nowrap rounded-lg ${btnBg} px-3 py-1.5 text-xs font-semibold text-white ${btnHover} disabled:opacity-50`}
                    >
                      {btnLabel}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {renderList(
        dispatchRequests,
        "자재 출고 승인 대기",
        "border-orange-300", "bg-orange-50",
        "bg-orange-500", "text-white",
        "bg-green-600", "hover:bg-green-700",
        "출고 승인",
        "출고 거부"
      )}
      {renderList(
        purchaseRequests,
        "자재 구매 승인 대기",
        "border-purple-300", "bg-purple-50",
        "bg-purple-500", "text-white",
        "bg-purple-600", "hover:bg-purple-700",
        "구매 승인",
        "구매 거부"
      )}
    </div>
  );
}
