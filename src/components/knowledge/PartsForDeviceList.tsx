"use client";

import { useEffect, useState } from "react";
import { searchPartsForDeviceAction } from "@/app/(admin)/lookup/actions";
import type { DeviceTarget, PartForDevice } from "@/app/(admin)/lookup/actions";
import { PART_TYPE_LABEL } from "@/components/catalog/partLabels";
import CompatBadge from "./CompatBadge";

const RANK_TITLE: Record<number, string> = {
  1: "검증됨 (실장 확인)",
  2: "문서 근거",
  3: "추정 · 미확인",
  9: "비호환 확인",
};

/** 기기 → 부품: P9 순위 묶음, 묶음 안에서는 재고 → Donor 순 (가격 없음) */
export default function PartsForDeviceList({ target }: { target: DeviceTarget }) {
  const [rows, setRows] = useState<PartForDevice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${target.modelId}|${target.variantId}|${target.boardId}`;

  useEffect(() => {
    let cancelled = false;
    searchPartsForDeviceAction(target).then((res) => {
      if (cancelled) return;
      setRows(res.data ?? []);
      setError(res.error ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers the three ids
  }, [key]);

  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!rows) return <p className="text-sm text-gray-500">검색 중…</p>;
  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">등록된 호환 부품이 없습니다. (부품 규격·호환 정보는 수리 기록과 관리자 화면에서 쌓입니다)</p>;
  }

  const groups = [1, 2, 3, 9].map((rank) => ({ rank, items: rows.filter((r) => r.rank === rank) })).filter((g) => g.items.length);
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.rank}>
          <h4 className={`mb-1 text-xs font-semibold ${g.rank === 9 ? "text-red-700" : "text-gray-600"}`}>
            {RANK_TITLE[g.rank]} · {g.items.length}건
          </h4>
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {g.items.map((r) => (
              <li key={`${r.part_spec_id}-${r.target_type}-${r.target_id}`} className="flex flex-wrap items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    <span className="mr-1 text-gray-500">{PART_TYPE_LABEL[r.part_type] ?? r.part_type}</span>
                    {r.part_name}
                    {r.manufacturer && <span className="ml-1 text-xs text-gray-500">({r.manufacturer})</span>}
                  </p>
                  <p className="text-xs text-gray-500">대상: {r.target_label}</p>
                  <div className="mt-1">
                    <CompatBadge status={r.status} confidence={r.confidence} isCandidate={r.is_candidate}
                      limitationNote={r.limitation_note} counts={r} />
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5 text-xs">
                  <span className={`rounded-full px-2 py-0.5 ${r.stock_qty > 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                    재고 {r.stock_qty}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 ${r.donor_qty > 0 ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-500"}`}>
                    Donor {r.donor_qty}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
