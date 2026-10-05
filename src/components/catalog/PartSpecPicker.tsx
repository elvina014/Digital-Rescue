"use client";

import { useState } from "react";
import { searchPartSpecsAction } from "@/app/(admin)/catalog/partActions";
import { useDebouncedSearch } from "./useDebouncedSearch";
import NewPartSpecInline from "./NewPartSpecInline";
import { PART_TYPE_LABEL } from "./partLabels";

export interface PickedPartSpec {
  partSpecId: string;
  label: string;
  compatTarget: "MODEL" | "BOARD";
}

interface Props {
  value: PickedPartSpec | null;
  onChange: (value: PickedPartSpec | null) => void;
  /** CS는 등록 불가 (DB에서도 차단) */
  allowCreate?: boolean;
  disabled?: boolean;
}

/** "부품 규격" 선택기 — 품번·마킹·별칭 검색 + 인라인 새 규격 등록 */
export default function PartSpecPicker({ value, onChange, allowCreate = true, disabled = false }: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { results, error, loading } = useDebouncedSearch(query, searchPartSpecsAction);

  function pick(next: PickedPartSpec) {
    onChange(next);
    setQuery("");
    setCreating(false);
  }

  if (value) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-teal-100 px-3 py-1 text-sm text-teal-900">{value.label}</span>
          {!disabled && (
            <button type="button" onClick={() => { onChange(null); setNotice(null); }} className="text-xs text-gray-500 underline hover:text-gray-700">
              해제
            </button>
          )}
        </div>
        {notice && <p className="mt-1 text-xs text-blue-700">{notice}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled}
          placeholder="품번·칩 마킹으로 검색 (예: LP140WF7, BQ780)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          aria-label="부품 규격 검색"
        />
        {query.trim() && !creating && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {loading && <li className="px-3 py-2 text-xs text-gray-400">검색 중...</li>}
            {!loading && results.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">일치하는 부품 규격이 없습니다.</li>}
            {results.map((r) => (
              <li key={r.part_spec_id}>
                <button
                  type="button"
                  onClick={() =>
                    pick({
                      partSpecId: r.part_spec_id,
                      label: `${PART_TYPE_LABEL[r.part_type] ?? r.part_type} · ${r.name}`,
                      compatTarget: r.compat_target === "BOARD" ? "BOARD" : "MODEL",
                    })
                  }
                  className="w-full px-3 py-2 text-left text-sm hover:bg-teal-50"
                >
                  <span className="text-xs text-gray-500">{PART_TYPE_LABEL[r.part_type] ?? r.part_type}</span> {r.name}
                  {r.manufacturer && <span className="ml-1 text-xs text-gray-500">{r.manufacturer}</span>}
                  {r.matched !== r.name && <span className="ml-2 text-xs text-gray-400">({r.matched})</span>}
                </button>
              </li>
            ))}
            {allowCreate && (
              <li className="border-t border-gray-100">
                <button type="button" onClick={() => setCreating(true)} className="w-full px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50">
                  + 새 부품 규격 등록
                </button>
              </li>
            )}
          </ul>
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      {creating && (
        <NewPartSpecInline
          defaultName={query}
          onCreated={(s, msg) => { pick(s); setNotice(msg); }}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}
