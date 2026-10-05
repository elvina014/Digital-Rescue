"use client";

import { useState } from "react";
import type { CandidateRow, InboundInput } from "../labels";

const inputCls = "rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

interface Props {
  candidate: CandidateRow;
  categories: { id: string; name: string }[];
  /** REQUEST: 기사 입고 요청 / BOOK: 관리자·팀장 적출 입고 */
  mode: "REQUEST" | "BOOK";
  pending: boolean;
  onSubmit: (input: InboundInput) => Promise<boolean>;
  onCancel: () => void;
}

/** 적출 입고 분류 입력 — 기존 적출품 등록과 같은 카테고리/사양/제품명/용량 (재고 반영은 관리자/팀장 승인 시) */
export default function ExtractForm({ candidate, categories, mode, pending, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<InboundInput>({
    categoryId: candidate.category_id,
    returnSpec: candidate.return_spec ?? "",
    returnName: candidate.return_name ?? "",
    returnCapacity: candidate.return_capacity ?? "",
  });
  const [warning, setWarning] = useState<string | null>(null);

  async function submit() {
    if (!form.categoryId || !form.returnSpec.trim() || !form.returnName.trim()) {
      return setWarning("카테고리·사양·제품명을 입력해 주세요.");
    }
    if (form.returnSpec.trim() === "외주") return setWarning("외주 항목으로는 입고할 수 없습니다.");
    setWarning(null);
    if (await onSubmit(form)) onCancel();
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
      <p className="text-xs text-indigo-900">
        {mode === "BOOK"
          ? "재고에 중고(USED)로 입고합니다. 같은 분류·용량의 중고 재고가 있으면 수량이 합산됩니다."
          : "입고할 재고 분류를 입력하면 관리자·팀장의 입고 승인 대기 목록에 올라갑니다."}
      </p>
      <div className="flex flex-wrap gap-2">
        <select
          value={form.categoryId ?? ""}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}
          className={inputCls}
          aria-label="카테고리"
        >
          <option value="">카테고리 선택</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input value={form.returnSpec} onChange={(e) => setForm({ ...form, returnSpec: e.target.value })} placeholder="사양 (예: M.2 NVMe)" className={inputCls} />
        <input value={form.returnName} onChange={(e) => setForm({ ...form, returnName: e.target.value })} placeholder="제품명 (예: 삼성)" className={inputCls} />
        <input
          value={form.returnCapacity}
          maxLength={50}
          onChange={(e) => setForm({ ...form, returnCapacity: e.target.value })}
          placeholder="용량 (선택)"
          className={`w-28 ${inputCls}`}
        />
      </div>
      {warning && <p className="text-xs text-red-600">{warning}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-white">닫기</button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {mode === "BOOK" ? "적출 입고" : "입고 요청"}
        </button>
      </div>
    </div>
  );
}
