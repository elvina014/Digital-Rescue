"use client";

import { useState } from "react";
import PartSpecPicker, { type PickedPartSpec } from "@/components/catalog/PartSpecPicker";
import type { CandidateInput } from "../actions";
import { CONDITION_LABEL } from "../labels";

const inputCls = "rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";
const EMPTY: CandidateInput = { description: "", partSpecId: null, quantity: 1, conditionEstimate: "UNTESTED", note: "" };

/** 적출 후보 부품 추가 — 설명 필수, 부품 규격은 선택 */
export default function CandidateForm({ pending, onAdd }: { pending: boolean; onAdd: (input: CandidateInput, spec: PickedPartSpec | null) => Promise<boolean> }) {
  const [form, setForm] = useState(EMPTY);
  const [spec, setSpec] = useState<PickedPartSpec | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function submit() {
    if (!form.description.trim()) return setWarning("부품 설명을 입력해 주세요.");
    if (!Number.isInteger(form.quantity) || form.quantity < 1) return setWarning("수량은 1 이상이어야 합니다.");
    setWarning(null);
    if (await onAdd({ ...form, partSpecId: spec?.partSpecId ?? null }, spec)) {
      setForm(EMPTY);
      setSpec(null);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-gray-300 p-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={form.description}
          maxLength={200}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="부품 (예: 액정 패널, RAM 8GB, 키보드)"
          className={`min-w-0 flex-1 ${inputCls}`}
        />
        <input
          type="number"
          min={1}
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
          className={`w-20 ${inputCls}`}
          aria-label="수량"
        />
        <select value={form.conditionEstimate} onChange={(e) => setForm({ ...form, conditionEstimate: e.target.value })} className={inputCls} aria-label="상태">
          {Object.entries(CONDITION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="text-xs text-gray-600">
        부품 규격 (선택)
        <PartSpecPicker value={spec} onChange={setSpec} />
      </div>
      <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="메모 (선택)" className={`w-full ${inputCls}`} />
      {warning && <p className="text-xs text-red-600">{warning}</p>}
      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={pending} className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-900 disabled:opacity-50">
          후보 추가
        </button>
      </div>
    </div>
  );
}
