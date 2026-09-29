"use client";

import { useState, useTransition } from "react";
import { updateCatalogBoardAction, addBoardAliasAction, deleteBoardAliasAction } from "../adminActions";
import ChipList from "../ChipList";
import { useOptimisticRemove } from "../useOptimisticRemove";
import type { BoardRow } from "./BoardsClient";

/** 보드 한 장: 제조사/메모 수정, 별칭 편집, 연결된 모델(읽기 전용) */
export default function BoardCard({ board, onDelete }: { board: BoardRow; onDelete: () => void }) {
  const [manufacturer, setManufacturer] = useState(board.manufacturer ?? "");
  const [notes, setNotes] = useState(board.notes ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const { isHidden, remove } = useOptimisticRemove();

  function handleSave() {
    startTransition(async () => {
      const res = await updateCatalogBoardAction(board.id, { manufacturer, notes });
      setMessage(res.error ? { ok: false, text: res.error } : { ok: true, text: "저장했습니다." });
    });
  }

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-start justify-between">
        <h3 className="font-mono text-base font-semibold text-gray-900">{board.boardNumber}</h3>
        <button type="button" onClick={onDelete} className="rounded-lg border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-50">
          삭제
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className="rounded-lg border border-gray-300 px-2 py-1 text-sm" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="제조사" maxLength={50} aria-label="제조사" />
        <input className="rounded-lg border border-gray-300 px-2 py-1 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="메모" aria-label="메모" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={handleSave} disabled={isPending} className="rounded-lg border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100 disabled:opacity-50">
          {isPending ? "저장 중..." : "저장"}
        </button>
        {message && <span className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span>}
      </div>

      <p className="mb-1 mt-3 text-xs font-semibold text-gray-600">별칭</p>
      <ChipList
        chips={board.aliases.map((a) => ({ id: a.id, label: a.alias }))}
        isHidden={isHidden}
        onRemove={async (id) => {
          const err = await remove(id, () => deleteBoardAliasAction(id));
          if (err) setMessage({ ok: false, text: err });
        }}
        addPlaceholder="별칭 추가 (예: NM-D451)"
        onAdd={async (v) => (await addBoardAliasAction(board.id, v)).error ?? null}
      />

      <p className="mb-1 mt-3 text-xs font-semibold text-gray-600">연결된 모델</p>
      <p className="text-sm text-gray-700">{board.models.length ? board.models.map((m) => m.label).join(", ") : "없음"}</p>
    </li>
  );
}
