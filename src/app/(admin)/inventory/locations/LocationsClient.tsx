"use client";

import { useState, useTransition } from "react";
import { createLocationAction, updateLocationAction } from "@/app/(admin)/labels/actions";
import { LOCATION_CODE_RE } from "@/app/(admin)/labels/shared";

export interface LocationRow {
  id: string;
  code: string;
  description: string | null;
  is_active: boolean;
  usage: number;
}

/** 보관 위치 목록 · 추가 · 설명 수정 · 사용 중지 (즉시 반영, 실패 시 되돌림) */
export default function LocationsClient({ initial }: { initial: LocationRow[] }) {
  const [rows, setRows] = useState(initial);
  const [code, setCode] = useState("");
  const [desc, setDesc] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return setError("위치 코드를 입력해 주세요.");
    if (!LOCATION_CODE_RE.test(c)) return setError("위치 코드는 영문 대문자·숫자와 '-'만 사용할 수 있습니다.");
    if (c.length > 20) return setError("위치 코드는 20자 이내로 입력해 주세요.");
    if (rows.some((r) => r.code === c)) return setError("이미 등록된 위치 코드입니다.");
    setError(null);
    const tempId = `temp-${c}`;
    const prev = rows;
    setRows([...rows, { id: tempId, code: c, description: desc.trim() || null, is_active: true, usage: 0 }].sort((a, b) => a.code.localeCompare(b.code)));
    setCode("");
    setDesc("");
    startTransition(async () => {
      const res = await createLocationAction(c, desc);
      if (res.error || !res.id) {
        setRows(prev);
        setError(res.error ?? "등록에 실패했습니다.");
        return;
      }
      setRows((cur) => cur.map((r) => (r.id === tempId ? { ...r, id: res.id! } : r)));
    });
  }

  function patch(row: LocationRow, change: { description?: string; is_active?: boolean }) {
    const prev = rows;
    setRows(rows.map((r) => (r.id === row.id ? { ...r, ...change, description: change.description !== undefined ? change.description.trim() || null : r.description } : r)));
    setError(null);
    startTransition(async () => {
      const res = await updateLocationAction(row.id, change);
      if (res.error) {
        setRows(prev);
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-4">
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="위치 코드 (A-01-04)" maxLength={20}
          className="w-44 rounded-lg border border-gray-300 px-3 py-1.5 font-mono text-sm uppercase" />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="설명 (선택)" maxLength={100}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        <button type="submit" disabled={pending} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          추가
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">코드</th>
              <th className="px-3 py-2">설명</th>
              <th className="px-3 py-2 text-right">보관 중</th>
              <th className="px-3 py-2">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-10 text-center text-gray-400">등록된 보관 위치가 없습니다.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className={r.is_active ? "" : "bg-gray-50 text-gray-400"}>
                  <td className="px-3 py-2 font-mono font-semibold">{r.code}</td>
                  <td className="px-3 py-2">
                    <input
                      key={`${r.id}-${r.description ?? ""}`}
                      defaultValue={r.description ?? ""}
                      maxLength={100}
                      disabled={r.id.startsWith("temp-")}
                      onBlur={(e) => e.target.value.trim() !== (r.description ?? "") && patch(r, { description: e.target.value })}
                      className="w-full rounded border border-transparent px-2 py-1 hover:border-gray-300 focus:border-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.usage}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={r.id.startsWith("temp-")}
                      onClick={() => patch(r, { is_active: !r.is_active })}
                      className="rounded border px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-50"
                    >
                      {r.is_active ? "사용 중 · 중지" : "중지됨 · 다시 사용"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
