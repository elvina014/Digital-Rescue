"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { confirmMaterialReturnAction } from "@/app/(admin)/tickets/actions";

interface ReturnRequest {
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

interface MaterialReturnWidgetProps {
  requests: ReturnRequest[];
}

export default function MaterialReturnWidget({ requests: initialRequests }: MaterialReturnWidgetProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) return null;

  function handleConfirm(materialId: string) {
    startTransition(async () => {
      setError(null);
      const res = await confirmMaterialReturnAction(materialId);
      if (res?.error) {
        setError(res.error);
      } else {
        setRequests((prev) => prev.filter((r) => r.id !== materialId));
      }
    });
  }

  return (
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
          {requests.length}
        </span>
        <h2 className="text-base font-semibold text-gray-900">자재 반환 확인 대기</h2>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>
      )}

      <ul className="divide-y divide-gray-200 text-sm">
        {requests.map((r) => {
          const itemLabel = [r.category_name, r.spec_name, r.product_name, r.capacity].filter(Boolean).join(" / ");
          const subtotal = r.base_estimate * r.quantity;
          const typeLabel = r.request_type === "purchase" ? "구매" : "출고";
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
                  <p className="mt-0.5 text-gray-600">
                    <span className={`mr-1 inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${r.request_type === "purchase" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                      {typeLabel}
                    </span>
                    {itemLabel} × {r.quantity}
                  </p>
                  <p className="text-xs text-gray-500">
                    요청자: <span className="font-medium text-gray-700">{r.technician_name}</span>
                  </p>
                  <p className="text-xs text-gray-400">
                    {subtotal.toLocaleString()}원 · {new Date(r.created_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleConfirm(r.id)}
                  className="whitespace-nowrap rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  반환 확인
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
