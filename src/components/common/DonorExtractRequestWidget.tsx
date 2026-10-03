"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { extractDonorPartAction } from "@/app/(admin)/donors/actions";

interface DonorExtractRequestItem {
  id: string;
  donor_id: string;
  donor_no: string;
  donor_label: string;
  description: string;
  label: string;
  quantity: number;
}

/** Donor 부품 적출 입고 대기 — 승인 시 먼저 목록에서 숨기고, 실패하면 되돌린다 */
export default function DonorExtractRequestWidget({ items: initialItems }: { items: DonorExtractRequestItem[] }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const items = initialItems.filter((i) => !hidden.has(i.id));
  if (items.length === 0) return null;

  function handleApprove(item: DonorExtractRequestItem) {
    startTransition(async () => {
      setError(null);
      setHidden((prev) => new Set(prev).add(item.id));
      const res = await extractDonorPartAction(item.donor_id, item.id, null);
      if (res.error) {
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        setError(res.error);
      }
    });
  }

  return (
    <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">{items.length}</span>
        <h2 className="text-base font-semibold text-gray-900">Donor 적출 입고 대기</h2>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}

      <ul className="divide-y divide-gray-200 text-sm">
        {items.map((item) => (
          <li key={item.id} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link href={`/donors/${item.donor_id}`} className="font-mono text-sm font-medium text-blue-700 hover:underline">
                  {item.donor_no}
                </Link>
                <span className="ml-2 text-xs text-gray-500">/ {item.donor_label}</span>
                <p className="mt-0.5 text-gray-600">
                  <span className="text-gray-400">적출:</span> {item.description}
                  <span className="mx-1.5 text-gray-300">→</span>
                  <span className="font-semibold text-amber-700">[입고]</span> {item.label} × {item.quantity}개
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleApprove(item)}
                className="whitespace-nowrap rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
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
