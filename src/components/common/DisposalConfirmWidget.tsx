"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { confirmDisposalAction } from "@/app/(admin)/tickets/actions";

interface DisposalTicket {
  id: string;
  device_brand: string;
  device_model: string | null;
  tag_info: string | null;
  customer_name: string;
  customer_phone: string;
  assignee_name: string;
  created_at: string;
}

interface DisposalConfirmWidgetProps {
  tickets: DisposalTicket[];
}

export default function DisposalConfirmWidget({ tickets: initialTickets }: DisposalConfirmWidgetProps) {
  const [tickets, setTickets] = useState(initialTickets);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (tickets.length === 0) return null;

  function handleConfirm(ticketId: string) {
    startTransition(async () => {
      setError(null);
      const res = await confirmDisposalAction(ticketId);
      if (res?.error) {
        setError(res.error);
      } else {
        setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      }
    });
  }

  return (
    <section className="rounded-xl border-2 border-red-300 bg-red-50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
          {tickets.length}
        </span>
        <h2 className="text-base font-semibold text-gray-900">폐기 기기 확인 대기</h2>
        <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
          실물 확인 후 처리 필요
        </span>
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-100 p-2 text-sm text-red-700">{error}</p>
      )}

      <ul className="divide-y divide-red-200 text-sm">
        {tickets.map((t) => {
          const deviceLabel = [t.device_brand, t.device_model].filter(Boolean).join(" ");
          const cancelDate = new Date(t.created_at).toLocaleDateString("ko-KR");
          return (
            <li key={t.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/tickets/${t.id}`}
                    className="text-sm font-semibold text-blue-700 hover:underline"
                  >
                    {t.customer_name} ({t.customer_phone})
                  </Link>
                  <p className="mt-0.5 text-gray-800 font-medium">{deviceLabel}</p>
                  {t.tag_info && (
                    <p className="text-xs text-gray-500">태그: {t.tag_info}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-500">
                    <span>접수번호: <span className="font-mono text-gray-700">{t.id.slice(0, 8)}…</span></span>
                    <span>담당: {t.assignee_name}</span>
                    <span>취소일: {cancelDate}</span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleConfirm(t.id)}
                  className="whitespace-nowrap rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  확인 완료
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
