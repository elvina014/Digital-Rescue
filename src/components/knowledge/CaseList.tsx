"use client";

import { useState } from "react";
import Link from "next/link";
import type { KnowledgeCase } from "@/app/(admin)/lookup/actions";
import { ACTION_TYPE_LABEL, FAULT_CATEGORY_LABEL, RESULT_LABEL } from "@/app/(admin)/tickets/[id]/repair-record/labels";
import { TICKET_STATUS_LABEL } from "./labels";

/** 과거 수리 사례 — 접수번호만 표시 (고객 정보 없음). 금액은 서버가 관리자/팀장에게만 내려준다 */
export default function CaseList({ cases, ticketIds }: { cases: KnowledgeCase[]; ticketIds: Record<string, string> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
      {cases.map((c) => {
        const expanded = open === c.receipt_no;
        const date = (c.completed_at ?? c.canceled_at ?? c.received_at ?? "").slice(0, 10);
        return (
          <li key={c.receipt_no} className="p-3 text-sm">
            <button type="button" onClick={() => setOpen(expanded ? null : c.receipt_no)}
              className="flex w-full flex-wrap items-center gap-2 text-left" aria-expanded={expanded}>
              <span className="font-mono text-xs text-gray-500">{c.receipt_no}</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{TICKET_STATUS_LABEL[c.status] ?? c.status}</span>
              {c.result && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800">{RESULT_LABEL[c.result] ?? c.result}</span>}
              {c.fault_category && <span className="text-xs text-gray-600">{FAULT_CATEGORY_LABEL[c.fault_category] ?? c.fault_category}</span>}
              <span className="min-w-0 flex-1 truncate text-gray-900">{c.diagnosis_summary ?? "진단 기록 없음"}</span>
              {c.final_price !== undefined && <span className="text-xs text-gray-700">{c.final_price.toLocaleString()}원</span>}
              <span className="text-xs text-gray-400">{date}</span>
            </button>
            {ticketIds[c.receipt_no] && (
              <Link href={`/tickets/${ticketIds[c.receipt_no]}`} className="ml-1 text-xs text-blue-700 underline">접수 열기</Link>
            )}
            {expanded && (
              <dl className="mt-2 space-y-1 rounded-lg bg-gray-50 p-2 text-xs text-gray-700">
                <div><dt className="inline font-medium">증상: </dt><dd className="inline">{c.symptoms.join(", ") || "-"}</dd></div>
                <div>
                  <dt className="inline font-medium">조치: </dt>
                  <dd className="inline">
                    {c.actions.length === 0 ? "-" : c.actions.map((a, i) => (
                      <span key={i} className={a.succeeded === false ? "text-red-600 line-through" : ""}>
                        {i > 0 && ", "}{ACTION_TYPE_LABEL[a.action_type] ?? a.action_type} {a.description}
                      </span>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium">사용 부품: </dt>
                  <dd className="inline">
                    {c.parts.map((p) => [p.category, p.product, p.capacity].filter(Boolean).join(" ") + ` ×${p.quantity}`).join(", ") || "-"}
                  </dd>
                </div>
                {c.refunded_amount ? <div>환불 {c.refunded_amount.toLocaleString()}원</div> : null}
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}
