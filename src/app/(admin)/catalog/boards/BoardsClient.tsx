"use client";

import { useState, useTransition } from "react";
import { createCatalogBoardAction, deleteCatalogBoardAction } from "../adminActions";
import { useOptimisticRemove } from "../useOptimisticRemove";
import BoardCard from "./BoardCard";

export interface BoardRow {
  id: string;
  boardNumber: string;
  manufacturer: string | null;
  notes: string | null;
  aliases: { id: string; alias: string }[];
  models: { id: string; label: string }[];
}

const inputCls = "rounded-lg border border-gray-300 px-3 py-1.5 text-sm";

/** 메인보드 목록 + 새 보드 등록. 모델 연결은 "모델 목록" 탭에서 한다. */
export default function BoardsClient({ boards }: { boards: BoardRow[] }) {
  const [boardNumber, setBoardNumber] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const { isHidden, remove } = useOptimisticRemove();

  function handleCreate() {
    if (!boardNumber.trim()) return setMessage({ ok: false, text: "보드 번호를 입력해 주세요." });
    startTransition(async () => {
      const res = await createCatalogBoardAction({ boardNumber, manufacturer, notes: "" });
      if (res.error) return setMessage({ ok: false, text: res.error });
      setMessage({ ok: true, text: `보드 ${boardNumber.trim()} 등록 완료` });
      setBoardNumber("");
      setManufacturer("");
    });
  }

  async function handleDelete(b: BoardRow) {
    if (!confirm(`보드 ${b.boardNumber}을(를) 삭제할까요? 별칭과 모델 연결도 함께 삭제됩니다.`)) return;
    const err = await remove(b.id, () => deleteCatalogBoardAction(b.id));
    setMessage(err ? { ok: false, text: err } : null);
  }

  const f = filter.trim().toLowerCase();
  const visible = boards.filter(
    (b) => !isHidden(b.id) && (!f || b.boardNumber.toLowerCase().includes(f) || b.aliases.some((a) => a.alias.toLowerCase().includes(f)))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-4">
        <span className="text-sm font-semibold text-gray-800">새 보드</span>
        <input className={inputCls} value={boardNumber} onChange={(e) => setBoardNumber(e.target.value)} placeholder="보드 번호 (예: LA-K091P)" maxLength={100} />
        <input className={inputCls} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="제조사 (예: Compal)" maxLength={50} />
        <button type="button" onClick={handleCreate} disabled={isPending} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {isPending ? "등록 중..." : "등록"}
        </button>
        <input className={`${inputCls} ml-auto w-56`} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="보드 번호·별칭 거르기" />
      </div>
      {message && (
        <p className={`rounded-lg p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>
      )}
      {visible.length === 0 ? (
        <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">표시할 보드가 없습니다.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visible.map((b) => (
            <BoardCard key={b.id} board={b} onDelete={() => handleDelete(b)} />
          ))}
        </ul>
      )}
    </div>
  );
}
