"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { approveReturnMaterialAction } from "@/app/(admin)/tickets/actions";

interface ReturnMaterialItem {
  id: string;
  ticket_id: string;
  receipt_no: string;
  original_label: string;
  return_category: string;
  return_spec: string;
  return_name: string;
  return_condition: string;
  return_quantity: number;
  return_capacity: string | null;
  technician_name: string;
}

interface ReturnMaterialInboundWidgetProps {
  items: ReturnMaterialItem[];
}

export default function ReturnMaterialInboundWidget({ items: initialItems }: ReturnMaterialInboundWidgetProps) {
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) return null;

  function handleApprove(materialId: string) {
    startTransition(async () => {
      setError(null);
      const res = await approveReturnMaterialAction(materialId);
      if (res?.error) {
        setError(res.error);
      } else {
        setItems((prev) => prev.filter((i) => i.id !== materialId));
      }
    });
  }

  return (
    <section className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
          {items.length}
        </span>
        <h2 className="text-base font-semibold text-gray-900">적출/반환 자재 입고 대기</h2>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>
      )}

      <ul className="divide-y divide-gray-200 text-sm">
        {items.map((item) => (
          <li key={item.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/tickets/${item.ticket_id}`}
                  className="font-mono text-sm font-medium text-blue-700 hover:underline"
                >
                  {item.receipt_no}
                </Link>
                <span className="ml-2 text-xs text-gray-500">/ {item.technician_name}</span>
                <p className="mt-0.5 text-gray-600">
                  <span className="text-gray-400">원본:</span> {item.original_label}
                  <span className="mx-1.5 text-gray-300">→</span>
                  <span className="font-semibold text-indigo-700">[반환]</span>{" "}
                  {item.return_category} / {item.return_spec} / {item.return_name}{item.return_capacity ? ` / ${item.return_capacity}` : ""}{" "}
                  × {item.return_quantity}개{" "}/
                  {" "}<span className={item.return_condition === "불량품" ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                    {item.return_condition}
                  </span>
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleApprove(item.id)}
                className="whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                입고 승인
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
