import Link from "next/link";
import { ITEM_CONDITION_LABEL } from "@/app/(admin)/labels/shared";
import LocationSelect, { type LocationOption } from "../LocationSelect";
import type { LookupHistory, LookupItem } from "./types";

const TX_LABEL: Record<string, string> = { INBOUND: "입고", OUTBOUND: "출고", ADJUSTMENT: "조정" };

/** 스캔 결과 — 재고 행 */
export default function ScanItemView({
  item,
  history,
  canManage,
  locations,
}: {
  item: LookupItem;
  history: LookupHistory[] | null;
  canManage: boolean;
  locations: LocationOption[];
}) {
  const name = [item.category, item.spec, item.product, item.capacity].filter(Boolean).join(" / ");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-xs text-gray-500">재고 라벨</p>
        <h2 className="mt-1 font-mono text-2xl font-bold">{item.label_code}</h2>
        <p className="mt-2 text-base font-medium text-gray-900">{name}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <dt className="text-gray-500">상태</dt>
          <dd>{ITEM_CONDITION_LABEL[item.condition] ?? item.condition}</dd>
          <dt className="text-gray-500">현재 수량</dt>
          <dd className={item.quantity === 0 ? "text-red-600" : ""}>{item.quantity}개{item.quantity === 0 ? " (출고됨)" : ""}</dd>
          <dt className="text-gray-500">부품 규격</dt>
          <dd>{item.part_spec ?? "-"}</dd>
          <dt className="text-gray-500">등록일</dt>
          <dd>{new Date(item.created_at).toLocaleDateString("ko-KR")}</dd>
        </dl>
        {item.is_outsourced && <p className="mt-2 text-xs text-amber-700">외주 항목입니다 (실물 재고 아님).</p>}
        <div className="mt-4 border-t pt-3">
          {canManage ? (
            <LocationSelect kind="ITEM" targetId={item.id} current={item.location} options={locations} />
          ) : (
            <p className="text-sm">
              보관 위치: <span className="font-mono font-semibold">{item.location ?? "미지정"}</span>
            </p>
          )}
        </div>
        {canManage && (
          <div className="mt-3 flex gap-3 text-sm">
            <Link href={`/labels/print?c=${item.label_code}`} className="text-blue-700 hover:underline">라벨 다시 인쇄</Link>
            <Link href="/inventory" className="text-blue-700 hover:underline">재고 관리</Link>
          </div>
        )}
      </section>

      {history && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-gray-900">입출고 이력 (최근 50건)</h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">이력이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">일시</th>
                    <th className="py-2 pr-3">구분</th>
                    <th className="py-2 pr-3 text-right">수량</th>
                    <th className="py-2 pr-3">담당자</th>
                    <th className="py-2 pr-3">메모</th>
                    <th className="py-2">접수번호</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap py-2 pr-3 text-xs text-gray-500">{new Date(h.created_at).toLocaleString("ko-KR")}</td>
                      <td className="py-2 pr-3">{TX_LABEL[h.type] ?? h.type}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{h.quantity}</td>
                      <td className="py-2 pr-3">{h.employee ?? "-"}</td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{h.notes ?? "-"}</td>
                      <td className="py-2 font-mono text-xs">
                        {h.ticket_id && h.receipt_no ? (
                          <Link href={`/tickets/${h.ticket_id}`} className="text-blue-700 hover:underline">{h.receipt_no}</Link>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
