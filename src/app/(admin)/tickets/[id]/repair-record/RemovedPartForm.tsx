"use client";

import { useState } from "react";
import PartSpecPicker, { type PickedPartSpec } from "@/components/catalog/PartSpecPicker";
import type { RemovedPartInput } from "./actions";
import { DISPOSITION_LABEL, INPUT_CLASS } from "./labels";

interface Props {
  categories: { id: string; name: string }[];
  pending: boolean;
  onAdd: (input: RemovedPartInput, spec: PickedPartSpec | null) => Promise<boolean>;
}

const EMPTY: RemovedPartInput = {
  description: "", disposition: null, categoryId: null, returnSpec: "", returnName: "", returnCapacity: "", returnCondition: "중고품", quantity: 1,
  partSpecId: null,
};

/** 적출 부품 추가 폼 — 재고등록을 고르면 카테고리/사양/제품명/용량/상태를 입력한다 */
export default function RemovedPartForm({ categories, pending, onAdd }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [warning, setWarning] = useState<string | null>(null);
  const [spec, setSpec] = useState<PickedPartSpec | null>(null);
  const stock = form.disposition === "STOCK";

  async function submit() {
    if (!form.description.trim()) return setWarning("부품 설명을 입력해 주세요.");
    if (stock && (!form.categoryId || !form.returnSpec.trim() || !form.returnName.trim())) {
      return setWarning("재고등록은 카테고리·사양·제품명을 입력해야 합니다.");
    }
    setWarning(null);
    if (await onAdd({ ...form, partSpecId: spec?.partSpecId ?? null }, spec)) {
      setForm(EMPTY);
      setSpec(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="떼어낸 부품 (예: 기존 배터리, 깨진 하판)"
          maxLength={200}
          className={`min-w-0 flex-1 ${INPUT_CLASS}`}
        />
        <select
          value={form.disposition ?? ""}
          onChange={(e) => setForm({ ...form, disposition: e.target.value || null })}
          className={INPUT_CLASS}
          aria-label="처리 방법"
        >
          <option value="">처리 방법 미정</option>
          {Object.entries(DISPOSITION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: Math.max(1, Number(e.target.value) || 1) })}
          className={`w-16 text-center ${INPUT_CLASS}`}
          aria-label="수량"
        />
        <button type="button" onClick={submit} disabled={pending} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50">
          추가
        </button>
      </div>
      {stock && (
        <div className="flex flex-wrap gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-2">
          <select
            value={form.categoryId ?? ""}
            onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}
            className={INPUT_CLASS}
            aria-label="재고 카테고리"
          >
            <option value="">카테고리</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input value={form.returnSpec} onChange={(e) => setForm({ ...form, returnSpec: e.target.value })} placeholder="사양 (예: M.2 NVMe)" maxLength={200} className={`w-36 ${INPUT_CLASS}`} />
          <input value={form.returnName} onChange={(e) => setForm({ ...form, returnName: e.target.value })} placeholder="제품명 (예: 삼성)" maxLength={200} className={`w-36 ${INPUT_CLASS}`} />
          <input value={form.returnCapacity} onChange={(e) => setForm({ ...form, returnCapacity: e.target.value })} placeholder="용량 (선택)" maxLength={50} className={`w-28 ${INPUT_CLASS}`} />
          <select value={form.returnCondition} onChange={(e) => setForm({ ...form, returnCondition: e.target.value })} className={INPUT_CLASS} aria-label="부품 상태">
            <option value="중고품">중고품</option>
            <option value="불량품">불량품</option>
          </select>
          <p className="w-full text-xs text-indigo-700">관리자/팀장이 입고 승인하면 중고 재고로 등록됩니다.</p>
        </div>
      )}
      <div className="flex items-start gap-2">
        <span className="shrink-0 pt-2 text-xs text-gray-500">부품 규격 (선택)</span>
        <div className="min-w-0 flex-1">
          <PartSpecPicker value={spec} onChange={setSpec} />
        </div>
      </div>
      {warning && <p className="text-xs text-red-600">{warning}</p>}
    </div>
  );
}
