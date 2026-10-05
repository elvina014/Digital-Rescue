"use client";

import { useState } from "react";
import { addSymptomAction, removeRepairRowAction } from "./actions";
import { useOptimisticList } from "./useOptimisticList";
import { INPUT_CLASS, type SymptomCodeRow, type TicketSymptomRow } from "./labels";

interface Props {
  ticketId: string;
  symptoms: TicketSymptomRow[];
  codes: SymptomCodeRow[];
  canEdit: boolean;
}

/** 증상: 코드(대분류 › 소분류) 선택 + 자유 입력 */
export default function SymptomPicker({ ticketId, symptoms, codes, canEdit }: Props) {
  const list = useOptimisticList(symptoms);
  const [codeId, setCodeId] = useState("");
  const [note, setNote] = useState("");

  const byId = new Map(codes.map((c) => [c.id, c]));
  const codeLabel = (id: string | null) => {
    const c = id ? byId.get(id) : null;
    if (!c) return null;
    const parent = c.parent_id ? byId.get(c.parent_id) : null;
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };
  const used = new Set(list.items.map((s) => s.symptom_code_id));
  const options = codes.filter((c) => c.is_active && !used.has(c.id));

  async function add() {
    if (!codeId && !note.trim()) return;
    const temp: TicketSymptomRow = {
      id: `temp-${Date.now()}`, ticket_id: ticketId, symptom_code_id: codeId || null, note: note.trim() || null,
      created_by: null, created_at: new Date().toISOString(),
    };
    const ok = await list.run((l) => [...l, temp], () => addSymptomAction(ticketId, { symptomCodeId: codeId || null, note }));
    if (ok) {
      setCodeId("");
      setNote("");
    }
  }

  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold text-gray-800">증상</h3>
      <div className="flex flex-wrap gap-2">
        {list.items.length === 0 && <span className="text-xs text-gray-400">기록된 증상이 없습니다.</span>}
        {list.items.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-900">
            {[codeLabel(s.symptom_code_id), s.note].filter(Boolean).join(" — ")}
            {canEdit && (
              <button
                type="button"
                onClick={() => list.run((l) => l.filter((x) => x.id !== s.id), () => removeRepairRowAction(ticketId, "ticket_symptoms", s.id))}
                className="ml-1 text-blue-400 hover:text-red-600"
                aria-label="증상 삭제"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {list.error && <p className="mt-1 text-xs text-red-600">{list.error}</p>}
      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select value={codeId} onChange={(e) => setCodeId(e.target.value)} className={`w-44 ${INPUT_CLASS}`} aria-label="증상 코드">
            <option value="">증상 코드 선택</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>{codeLabel(c.id)}</option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="상세 내용 (선택)"
            maxLength={200}
            className={`min-w-0 flex-1 ${INPUT_CLASS}`}
          />
          <button type="button" onClick={add} disabled={list.pending} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50">
            추가
          </button>
        </div>
      )}
    </div>
  );
}
