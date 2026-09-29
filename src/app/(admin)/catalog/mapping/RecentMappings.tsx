"use client";

import { formatDateTime } from "@/lib/date";

export interface RecentMapping {
  aliasId: string;
  alias: string;
  modelLabel: string;
  linked: number;
  createdAt: string;
}

interface Props {
  items: RecentMapping[];
  busyId: string | null;
  onUndo: (item: RecentMapping) => void;
}

/** 최근 매핑 목록 + 되돌리기 */
export default function RecentMappings({ items, busyId, onUndo }: Props) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-800">최근 연결 (매핑 별칭)</h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">아직 매핑된 항목이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((r) => (
            <li key={r.aliasId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <span className="font-mono text-gray-900">{r.alias}</span>
                <span className="mx-2 text-gray-400">→</span>
                <span className="text-gray-800">{r.modelLabel}</span>
                <span className="ml-2 text-xs text-gray-500">
                  접수건 {r.linked}건 · {formatDateTime(r.createdAt)}
                </span>
              </div>
              <button
                type="button"
                disabled={busyId === r.aliasId}
                onClick={() => onUndo(r)}
                className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50"
              >
                {busyId === r.aliasId ? "처리 중..." : "되돌리기"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
