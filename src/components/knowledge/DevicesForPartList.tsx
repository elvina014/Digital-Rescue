"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { searchDevicesForPartAction } from "@/app/(admin)/lookup/actions";
import type { DeviceForPart, SpecDonorRow, SpecStockRow } from "@/app/(admin)/lookup/actions";
import CompatBadge from "./CompatBadge";

const TARGET_LABEL: Record<string, string> = { MODEL: "모델", VARIANT: "변형", BOARD: "메인보드" };

interface Data { devices: DeviceForPart[]; stock: SpecStockRow[]; donors: SpecDonorRow[] }

/** 부품 → 기기: 호환 대상(보드는 연결 모델 포함) + 이 규격의 재고·Donor */
export default function DevicesForPartList({ partSpecId, canOpenDonors }: { partSpecId: string; canOpenDonors: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    searchDevicesForPartAction(partSpecId).then((res) => {
      if (cancelled) return;
      setData(res.data ?? null);
      setError(res.error ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [partSpecId]);

  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-gray-500">검색 중…</p>;

  const usable = data.devices.filter((d) => d.rank !== 9);
  const incompatible = data.devices.filter((d) => d.rank === 9);
  const stockQty = data.stock.reduce((n, s) => n + s.quantity, 0);

  return (
    <div className="space-y-4">
      <section>
        <h4 className="mb-1 text-xs font-semibold text-gray-600">호환 기기 · {usable.length}건</h4>
        {usable.length === 0 ? (
          <p className="text-sm text-gray-500">등록된 호환 기기가 없습니다.</p>
        ) : (
          <DeviceRows rows={usable} />
        )}
      </section>
      {incompatible.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold text-red-700">비호환 확인 · {incompatible.length}건</h4>
          <DeviceRows rows={incompatible} />
        </section>
      )}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h4 className="text-xs font-semibold text-gray-600">재고 (외주 제외) · 합계 {stockQty}개</h4>
          {data.stock.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">이 규격에 연결된 재고가 없습니다.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {data.stock.map((s) => (
                <li key={s.id}>
                  {s.label} {s.capacity && <span className="text-gray-500">{s.capacity}</span>}{" "}
                  <span className="text-xs text-gray-500">{s.condition === "NEW" ? "신품" : "중고"}</span> · {s.quantity}개
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h4 className="text-xs font-semibold text-gray-600">Donor 적출 가능 · {data.donors.length}건</h4>
          {data.donors.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">이 규격의 Donor 부품이 없습니다.</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm">
              {data.donors.map((d, i) => (
                <li key={`${d.donorId}-${i}`}>
                  {canOpenDonors ? (
                    <Link href={`/donors/${d.donorId}`} className="text-blue-700 underline">{d.donorNo}</Link>
                  ) : (
                    d.donorNo
                  )}{" "}
                  {d.device} — {d.description} · {d.quantity}개
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function DeviceRows({ rows }: { rows: DeviceForPart[] }) {
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
      {rows.map((d) => (
        <li key={`${d.target_type}-${d.target_id}`} className="p-3">
          <p className="text-sm font-medium text-gray-900">
            <span className="mr-1 text-xs text-gray-500">{TARGET_LABEL[d.target_type] ?? d.target_type}</span>
            {d.target_label}
          </p>
          {d.linked_models && <p className="text-xs text-gray-500">사용 모델: {d.linked_models}</p>}
          <div className="mt-1">
            <CompatBadge status={d.status} confidence={d.confidence} isCandidate={d.is_candidate}
              limitationNote={d.limitation_note} counts={d} />
          </div>
        </li>
      ))}
    </ul>
  );
}
