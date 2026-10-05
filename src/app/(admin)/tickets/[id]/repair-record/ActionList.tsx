"use client";

import { useState } from "react";
import { addRepairActionAction, removeRepairRowAction, setRepairActionResultAction } from "./actions";
import { useOptimisticList } from "./useOptimisticList";
import RecordList from "./RecordList";
import { ACTION_TYPE_LABEL, INPUT_CLASS, type ActionRow } from "./labels";

const EMPTY = { actionType: "REPLACE", description: "", succeeded: "" };
const toBool = (v: string) => (v === "" ? null : v === "true");

/** 조치 내역 — 순서대로 기록하고, 실패한 시도도 지우지 않고 남긴다 */
export default function ActionList({ ticketId, actions, canEdit }: { ticketId: string; actions: ActionRow[]; canEdit: boolean }) {
  const list = useOptimisticList(actions);
  const [form, setForm] = useState(EMPTY);

  async function add() {
    if (!form.description.trim()) return;
    const sortOrder = list.items.reduce((max, a) => Math.max(max, a.sort_order), 0) + 1;
    const temp: ActionRow = {
      id: `temp-${Date.now()}`, ticket_id: ticketId, sort_order: sortOrder, action_type: form.actionType,
      description: form.description.trim(), succeeded: toBool(form.succeeded), fault_id: null, performed_by: null,
      performed_at: new Date().toISOString(),
    };
    const ok = await list.run(
      (l) => [...l, temp],
      () => addRepairActionAction(ticketId, { actionType: form.actionType, description: form.description, succeeded: toBool(form.succeeded), sortOrder })
    );
    if (ok) setForm(EMPTY);
  }

  function setResult(a: ActionRow, value: string) {
    const succeeded = toBool(value);
    list.run((l) => l.map((x) => (x.id === a.id ? { ...x, succeeded } : x)), () => setRepairActionResultAction(ticketId, a.id, succeeded));
  }

  return (
    <RecordList
      title="조치 내역"
      hint="실패한 시도도 남겨 주세요"
      items={list.items}
      emptyText="기록된 조치가 없습니다."
      error={list.error}
      canEdit={canEdit}
      onRemove={(a) => list.run((l) => l.filter((x) => x.id !== a.id), () => removeRepairRowAction(ticketId, "repair_actions", a.id))}
      renderItem={(a) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tabular-nums text-gray-400">{a.sort_order}.</span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">{ACTION_TYPE_LABEL[a.action_type] ?? a.action_type}</span>
          <span className="text-gray-900">{a.description}</span>
          {canEdit ? (
            <select
              value={a.succeeded === null ? "" : String(a.succeeded)}
              onChange={(e) => setResult(a, e.target.value)}
              className="rounded border border-gray-300 px-1.5 py-0.5 text-xs"
              aria-label="조치 결과"
            >
              <option value="">미확정</option>
              <option value="true">성공</option>
              <option value="false">실패</option>
            </select>
          ) : (
            <span className={a.succeeded === true ? "text-xs font-semibold text-green-600" : a.succeeded === false ? "text-xs font-semibold text-red-600" : "text-xs text-gray-400"}>
              {a.succeeded === true ? "성공" : a.succeeded === false ? "실패" : "미확정"}
            </span>
          )}
        </div>
      )}
    >
      <div className="flex flex-wrap gap-2">
        <select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })} className={INPUT_CLASS} aria-label="조치 유형">
          {Object.entries(ACTION_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="조치 내용 (예: U7000 교체)" className={`min-w-0 flex-1 ${INPUT_CLASS}`} />
        <select value={form.succeeded} onChange={(e) => setForm({ ...form, succeeded: e.target.value })} className={INPUT_CLASS} aria-label="결과">
          <option value="">미확정</option>
          <option value="true">성공</option>
          <option value="false">실패</option>
        </select>
        <button type="button" onClick={add} disabled={list.pending} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50">
          추가
        </button>
      </div>
    </RecordList>
  );
}
