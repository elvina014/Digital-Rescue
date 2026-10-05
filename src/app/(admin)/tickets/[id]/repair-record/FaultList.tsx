"use client";

import { useState } from "react";
import { addFaultAction, removeRepairRowAction } from "./actions";
import { useOptimisticList } from "./useOptimisticList";
import RecordList from "./RecordList";
import { FAULT_TYPE_LABEL, INPUT_CLASS, type FaultRow } from "./labels";

const EMPTY = { component: "", faultType: "SHORT", description: "" };

/** 확인된 고장 부위 (예: U7000 쇼트) */
export default function FaultList({ ticketId, faults, canEdit }: { ticketId: string; faults: FaultRow[]; canEdit: boolean }) {
  const list = useOptimisticList(faults);
  const [form, setForm] = useState(EMPTY);

  async function add() {
    if (!form.component.trim()) return;
    const sortOrder = list.items.length + 1;
    const temp: FaultRow = {
      id: `temp-${Date.now()}`, ticket_id: ticketId, sort_order: sortOrder, component: form.component.trim(),
      fault_type: form.faultType, description: form.description.trim() || null, created_by: null, created_at: new Date().toISOString(),
    };
    const ok = await list.run((l) => [...l, temp], () => addFaultAction(ticketId, { ...form, sortOrder }));
    if (ok) setForm(EMPTY);
  }

  return (
    <RecordList
      title="고장 부위"
      items={list.items}
      emptyText="기록된 고장 부위가 없습니다."
      error={list.error}
      canEdit={canEdit}
      onRemove={(f) => list.run((l) => l.filter((x) => x.id !== f.id), () => removeRepairRowAction(ticketId, "repair_faults", f.id))}
      renderItem={(f) => (
        <p>
          <span className="font-medium text-gray-900">{f.component}</span>{" "}
          <span className="text-red-600">{FAULT_TYPE_LABEL[f.fault_type] ?? f.fault_type}</span>
          {f.description && <span className="ml-2 text-xs text-gray-500">{f.description}</span>}
        </p>
      )}
    >
      <div className="flex flex-wrap gap-2">
        <input value={form.component} onChange={(e) => setForm({ ...form, component: e.target.value })} placeholder="부품/위치 (예: U7000, LCD 케이블)" maxLength={100} className={`w-48 ${INPUT_CLASS}`} />
        <select value={form.faultType} onChange={(e) => setForm({ ...form, faultType: e.target.value })} className={INPUT_CLASS} aria-label="고장 유형">
          {Object.entries(FAULT_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="설명 (선택)" className={`min-w-0 flex-1 ${INPUT_CLASS}`} />
        <button type="button" onClick={add} disabled={list.pending} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50">
          추가
        </button>
      </div>
    </RecordList>
  );
}
