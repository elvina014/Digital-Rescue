"use client";

import { useState } from "react";
import { addMeasurementAction, removeRepairRowAction } from "./actions";
import { useOptimisticList } from "./useOptimisticList";
import RecordList from "./RecordList";
import { INPUT_CLASS, JUDGEMENT_LABEL, MEASURE_KIND_LABEL, type MeasurementRow } from "./labels";

const EMPTY = { label: "", kind: "VOLTAGE", value: "", unit: "V", judgement: "UNKNOWN", note: "" };
const DEFAULT_UNIT: Record<string, string> = { VOLTAGE: "V", RESISTANCE: "Ω", DIODE: "", CURRENT: "A", OTHER: "" };

/** 측정값 목록 (예: PPBUS_G3H 0.2V 비정상) */
export default function MeasurementList({ ticketId, measurements, canEdit }: { ticketId: string; measurements: MeasurementRow[]; canEdit: boolean }) {
  const list = useOptimisticList(measurements);
  const [form, setForm] = useState(EMPTY);

  async function add() {
    if (!form.label.trim() || !form.value.trim()) return;
    const num = Number(form.value);
    const sortOrder = list.items.length + 1;
    const temp: MeasurementRow = {
      id: `temp-${Date.now()}`, ticket_id: ticketId, sort_order: sortOrder, label: form.label.trim(), kind: form.kind,
      value: Number.isFinite(num) ? num : null, value_text: Number.isFinite(num) ? null : form.value.trim(),
      unit: form.unit.trim() || null, judgement: form.judgement, note: form.note.trim() || null, created_by: null,
      created_at: new Date().toISOString(),
    };
    const ok = await list.run((l) => [...l, temp], () => addMeasurementAction(ticketId, { ...form, sortOrder }));
    if (ok) setForm({ ...EMPTY, kind: form.kind, unit: form.unit });
  }

  return (
    <RecordList
      title="측정값"
      items={list.items}
      emptyText="기록된 측정값이 없습니다."
      error={list.error}
      canEdit={canEdit}
      onRemove={(m) => list.run((l) => l.filter((x) => x.id !== m.id), () => removeRepairRowAction(ticketId, "repair_measurements", m.id))}
      renderItem={(m) => (
        <p>
          <span className="font-medium text-gray-900">{m.label}</span>{" "}
          <span className="text-gray-500">({MEASURE_KIND_LABEL[m.kind] ?? m.kind})</span>{" "}
          <span className="tabular-nums">{m.value ?? m.value_text}{m.unit ?? ""}</span>{" "}
          <span className={m.judgement === "ABNORMAL" ? "font-semibold text-red-600" : m.judgement === "NORMAL" ? "text-green-600" : "text-gray-400"}>
            {JUDGEMENT_LABEL[m.judgement] ?? m.judgement}
          </span>
          {m.note && <span className="ml-2 text-xs text-gray-500">{m.note}</span>}
        </p>
      )}
    >
      <div className="flex flex-wrap gap-2">
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="측정 지점 (예: PPBUS_G3H)" maxLength={100} className={`min-w-0 flex-1 ${INPUT_CLASS}`} />
        <select
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value, unit: DEFAULT_UNIT[e.target.value] ?? "" })}
          className={INPUT_CLASS}
          aria-label="측정 종류"
        >
          {Object.entries(MEASURE_KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="값" className={`w-20 ${INPUT_CLASS}`} />
        <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="단위" maxLength={20} className={`w-16 ${INPUT_CLASS}`} />
        <select value={form.judgement} onChange={(e) => setForm({ ...form, judgement: e.target.value })} className={INPUT_CLASS} aria-label="판정">
          {Object.entries(JUDGEMENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button type="button" onClick={add} disabled={list.pending} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50">
          추가
        </button>
      </div>
    </RecordList>
  );
}
