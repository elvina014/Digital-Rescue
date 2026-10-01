"use client";

import { useState } from "react";
import PartSpecPicker, { type PickedPartSpec } from "@/components/catalog/PartSpecPicker";
import { linkItemPartSpecAction } from "../../partActions";

export interface StockRow {
  id: string;
  category: string;
  spec: string;
  product: string;
  capacity: string | null;
  condition: string;
  quantity: number;
  partSpec: PickedPartSpec | null;
}

/** 재고 항목 ↔ 부품 규격 연결. 수량·금액은 바꾸지 않고 규격 연결만 저장한다. */
export default function StockLinkClient({ items }: { items: StockRow[] }) {
  const [filter, setFilter] = useState("");
  const [unlinkedOnly, setUnlinkedOnly] = useState(false);
  // 낙관적 업데이트: 화면을 먼저 바꾸고 서버 오류면 되돌린다
  const [local, setLocal] = useState<Record<string, PickedPartSpec | null>>({});
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  const current = (i: StockRow) => (i.id in local ? local[i.id] : i.partSpec);

  async function handleChange(item: StockRow, next: PickedPartSpec | null) {
    const before = current(item);
    setError(null);
    setLocal((prev) => ({ ...prev, [item.id]: next }));
    const res = await linkItemPartSpecAction(item.id, next?.partSpecId ?? null);
    if (res.error) {
      setLocal((prev) => ({ ...prev, [item.id]: before }));
      setError({ id: item.id, text: res.error });
    }
  }

  const f = filter.trim().toLowerCase();
  const visible = items.filter((i) => {
    if (unlinkedOnly && current(i)) return false;
    return !f || [i.category, i.spec, i.product, i.capacity ?? ""].some((v) => v.toLowerCase().includes(f));
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="카테고리·사양·제품명 거르기" className="w-64 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        <label className="flex items-center gap-1 text-sm text-gray-700">
          <input type="checkbox" checked={unlinkedOnly} onChange={(e) => setUnlinkedOnly(e.target.checked)} /> 미연결만
        </label>
        <p className="text-xs text-gray-500">
          재고 행의 기본 부품 규격을 지정합니다. 수리 기록의 &quot;사용 부품 호환 확인&quot;에서 이 규격이 미리 선택됩니다. (외주 항목 제외)
        </p>
      </div>
      {visible.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">표시할 재고 항목이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {visible.map((i) => (
            <li key={i.id} className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1fr_1fr] md:items-center">
              <div className="text-sm text-gray-800">
                {[i.category, i.spec, i.product, i.capacity].filter(Boolean).join(" / ")}
                <span className="ml-2 text-xs text-gray-500">{i.condition === "USED" ? "중고" : "신품"} · 재고 {i.quantity}</span>
              </div>
              <div>
                <PartSpecPicker value={current(i)} onChange={(v) => handleChange(i, v)} />
                {error?.id === i.id && <p className="mt-1 text-xs text-red-600">{error.text}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
