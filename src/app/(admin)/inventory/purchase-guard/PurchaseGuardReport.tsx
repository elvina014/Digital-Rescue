import Link from "next/link";
import { formatDateTime } from "@/lib/date";
import { CONDITION_LABELS, REASON_CODES, REASON_LABELS, SOURCE_LABELS, isDonorSource, reasonLabel } from "@/components/purchase-guard/labels";

export interface GuardLogRow {
  id: string;
  ticketId: string;
  receiptNo: string | null;
  itemLabel: string;
  quantity: number;
  resourceCount: number;
  resources: { source: string; label: string; part_name: string | null; qty: number; condition: string | null; note: string | null }[];
  reasonCode: string | null;
  reasonNote: string | null;
  createdAt: string;
  materialStatus: string | null;
  requester: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "대기",
  requested: "요청중",
  approved: "승인",
  rejected: "거부",
  cancel_requested: "취소요청",
  cancelled: "취소",
};

/** 구매 사유 보고서 — 요약 + 목록 (고객 정보·가격 없음) */
export default function PurchaseGuardReport({ rows }: { rows: GuardLogRow[] }) {
  const withResources = rows.filter((r) => r.resourceCount > 0);
  const pct = rows.length ? Math.round((withResources.length / rows.length) * 100) : 0;
  const byReason = REASON_CODES.map((c) => ({ code: c, n: rows.filter((r) => r.reasonCode === c).length }));
  const bySource = new Map<string, number>();
  for (const r of rows) for (const res of r.resources) bySource.set(res.source, (bySource.get(res.source) ?? 0) + 1);

  return (
    <>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat title="구매 요청" value={`${rows.length}건`} />
        <Stat title="내부 자원이 있었던 요청" value={`${withResources.length}건 (${pct}%)`} />
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">사유별</p>
          <ul className="mt-1 space-y-0.5 text-sm text-gray-800">
            {byReason.map((r) => <li key={r.code}>{REASON_LABELS[r.code]} · {r.n}건</li>)}
          </ul>
        </div>
      </section>
      {bySource.size > 0 && (
        <p className="text-xs text-gray-500">
          발견된 자원 종류: {[...bySource].map(([s, n]) => `${SOURCE_LABELS[s] ?? s} ${n}`).join(" · ")}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">기간 내 기록이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-3 py-2">일시</th><th className="px-3 py-2">접수번호</th><th className="px-3 py-2">자재</th>
                <th className="px-3 py-2">내부 자원</th><th className="px-3 py-2">사유</th><th className="px-3 py-2">요청자</th>
                <th className="px-3 py-2">현재 상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{formatDateTime(r.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link href={`/tickets/${r.ticketId}`} className="font-mono text-blue-700 hover:underline">{r.receiptNo ?? "접수 열기"}</Link>
                  </td>
                  <td className="px-3 py-2 text-gray-800">{r.itemLabel} × {r.quantity}</td>
                  <td className="px-3 py-2"><ResourceCell row={r} /></td>
                  <td className="px-3 py-2 text-gray-800">
                    {reasonLabel(r.reasonCode)}
                    {r.reasonNote && <p className="text-xs text-gray-500">{r.reasonNote}</p>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.requester ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">{r.materialStatus ? STATUS_LABELS[r.materialStatus] ?? r.materialStatus : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function ResourceCell({ row }: { row: GuardLogRow }) {
  if (row.resourceCount === 0) return <span className="text-gray-400">없음</span>;
  const stock = row.resources.filter((r) => !isDonorSource(r.source)).length;
  const donor = row.resources.length - stock;
  return (
    <details>
      <summary className="cursor-pointer text-gray-800">재고 {stock} · Donor {donor}</summary>
      <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
        {row.resources.map((r, i) => (
          <li key={i}>
            {r.label}{r.part_name ? ` (${r.part_name})` : ""} · {r.qty}개
            {r.condition ? ` · ${CONDITION_LABELS[r.condition] ?? r.condition}` : ""}
            {r.note ? ` · ${r.note}` : ""} — {SOURCE_LABELS[r.source] ?? r.source}
          </li>
        ))}
      </ul>
    </details>
  );
}
