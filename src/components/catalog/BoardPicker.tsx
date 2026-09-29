"use client";

import { useState } from "react";
import { searchCatalogBoardsAction } from "@/app/(admin)/catalog/actions";
import { useDebouncedSearch } from "./useDebouncedSearch";

export interface PickedBoard {
  boardId: string;
  label: string;
}

interface Props {
  value: PickedBoard | null;
  onChange: (value: PickedBoard | null) => void;
}

/** 메인보드 번호 선택기 — 보드는 관리자만 등록하므로 여기서는 검색·선택만 한다. */
export default function BoardPicker({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const { results, error, loading } = useDebouncedSearch(query, searchCatalogBoardsAction);

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-900">{value.label}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs text-gray-500 underline hover:text-gray-700">
          해제
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="보드 번호로 검색 (예: LA-K091P)"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        aria-label="메인보드 검색"
      />
      {query.trim() && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading && <li className="px-3 py-2 text-xs text-gray-400">검색 중...</li>}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-500">일치하는 보드가 없습니다. (보드 등록은 관리자에게 요청해 주세요)</li>
          )}
          {results.map((r) => (
            <li key={r.board_id}>
              <button
                type="button"
                onClick={() => {
                  onChange({ boardId: r.board_id, label: r.board_number + (r.manufacturer ? ` (${r.manufacturer})` : "") });
                  setQuery("");
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-purple-50"
              >
                {r.board_number}
                {r.manufacturer && <span className="ml-1 text-xs text-gray-500">{r.manufacturer}</span>}
                {r.matched !== r.board_number && <span className="ml-2 text-xs text-gray-400">({r.matched})</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
