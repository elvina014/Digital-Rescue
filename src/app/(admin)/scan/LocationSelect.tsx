"use client";

import { useState, useTransition } from "react";
import { setStorageLocationAction } from "@/app/(admin)/labels/actions";

export interface LocationOption {
  id: string;
  code: string;
  description: string | null;
}

/** 보관 위치 변경 (관리자·팀장) — 즉시 반영, 실패 시 원래 위치로 되돌림 */
export default function LocationSelect({
  kind,
  targetId,
  current,
  options,
}: {
  kind: "ITEM" | "DONOR";
  targetId: string;
  current: string | null;
  options: LocationOption[];
}) {
  const [shown, setShown] = useState<string | null>(current);
  const [selected, setSelected] = useState<string>(options.find((o) => o.code === current)?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    const prev = shown;
    const next = options.find((o) => o.id === selected)?.code ?? null;
    if (next === prev) return;
    setShown(next);
    setError(null);
    startTransition(async () => {
      const res = await setStorageLocationAction(kind, targetId, selected || null);
      if (res.error) {
        setShown(prev);
        setSelected(options.find((o) => o.code === prev)?.id ?? "");
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-1">
      <p className="text-sm">
        현재 위치: <span className="font-mono font-semibold">{shown ?? "미지정"}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">위치 해제</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code}
              {o.description ? ` — ${o.description}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50"
        >
          보관 위치 변경
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
