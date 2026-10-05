"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PRINT_LABELS } from "./shared";

export interface PickRow {
  code: string;
  title: string;
  sub: string;
  location: string | null;
  /** 등록일 (서버에서 포맷 — 하이드레이션 불일치 방지) */
  createdDate: string;
}

/** 인쇄할 라벨 선택 → /labels/print?c=... */
export default function LabelPicker({ tab, recent, rows }: { tab: "items" | "donors"; recent: boolean; rows: PickRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.code, r.title, r.location ?? ""].some((v) => v.toLowerCase().includes(q)));
  }, [rows, filter]);

  function toggle(code: string) {
    setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));
  }

  function toggleAllVisible() {
    const all = visible.every((r) => picked.includes(r.code));
    setPicked((p) => (all ? p.filter((c) => !visible.some((r) => r.code === c)) : [...new Set([...p, ...visible.map((r) => r.code)])]));
  }

  function print() {
    if (picked.length === 0) return setError("인쇄할 라벨을 선택해 주세요.");
    if (picked.length > MAX_PRINT_LABELS) return setError(`한 번에 ${MAX_PRINT_LABELS}장까지 인쇄할 수 있습니다.`);
    setError(null);
    router.push(`/labels/print?c=${picked.join(",")}`);
  }

  const tabHref = (t: string, r: boolean) => `/labels?tab=${t}${r ? "&recent=1" : ""}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={tabHref("items", recent)} className={`rounded-lg px-3 py-1.5 ${tab === "items" ? "bg-blue-600 text-white" : "border"}`}>재고</Link>
        <Link href={tabHref("donors", recent)} className={`rounded-lg px-3 py-1.5 ${tab === "donors" ? "bg-blue-600 text-white" : "border"}`}>Donor 기기</Link>
        <Link href={tabHref(tab, !recent)} className={`rounded-lg px-3 py-1.5 ${recent ? "bg-gray-800 text-white" : "border"}`}>최근 7일 등록</Link>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="코드·품목·위치 검색"
          className="ml-auto w-56 rounded-lg border border-gray-300 px-3 py-1.5"
        />
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={print} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          선택 라벨 인쇄 ({picked.length})
        </button>
        {picked.length > 0 && (
          <button type="button" onClick={() => setPicked([])} className="text-sm text-gray-500 hover:underline">선택 해제</button>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="w-10 px-3 py-2">
                <input type="checkbox" aria-label="전체 선택" checked={visible.length > 0 && visible.every((r) => picked.includes(r.code))} onChange={toggleAllVisible} />
              </th>
              <th className="px-3 py-2">라벨</th>
              <th className="px-3 py-2">{tab === "items" ? "품목" : "기기"}</th>
              <th className="px-3 py-2">상태</th>
              <th className="px-3 py-2">위치</th>
              <th className="px-3 py-2">등록일</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-gray-400">표시할 항목이 없습니다.</td></tr>
            ) : (
              visible.map((r) => (
                <tr key={r.code} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`${r.code} 선택`} checked={picked.includes(r.code)} onChange={() => toggle(r.code)} />
                  </td>
                  <td className="px-3 py-2 font-mono">
                    <Link href={`/scan/${r.code}`} className="text-blue-700 hover:underline">{r.code}</Link>
                  </td>
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2 text-gray-600">{r.sub}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{r.location ?? "-"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.createdDate}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
