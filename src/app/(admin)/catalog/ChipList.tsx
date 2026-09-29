"use client";

import { useState } from "react";

interface Chip {
  id: string;
  label: string;
  hint?: string;
}

interface Props {
  chips: Chip[];
  isHidden: (id: string) => boolean;
  onRemove: (id: string) => void;
  addPlaceholder?: string;
  onAdd?: (value: string) => Promise<string | null>;
}

/** 칩 목록 + (선택) 추가 입력 — 별칭·변형 편집용 */
export default function ChipList({ chips, isHidden, onRemove, addPlaceholder, onAdd }: Props) {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    if (!onAdd || !value.trim()) return;
    setPending(true);
    const err = await onAdd(value);
    setPending(false);
    setError(err);
    if (!err) setValue("");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chips.filter((c) => !isHidden(c.id)).map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-800">
            {c.label}
            {c.hint && <span className="text-xs text-gray-400">{c.hint}</span>}
            <button type="button" onClick={() => onRemove(c.id)} className="ml-1 text-gray-400 hover:text-red-600" aria-label={`${c.label} 삭제`}>
              ×
            </button>
          </span>
        ))}
        {chips.length === 0 && <span className="text-xs text-gray-400">없음</span>}
      </div>
      {onAdd && (
        <div className="mt-2 flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
            placeholder={addPlaceholder}
            maxLength={200}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button type="button" onClick={handleAdd} disabled={pending} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50">
            {pending ? "추가 중..." : "추가"}
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
