"use client";

import { useState, useTransition } from "react";
import { convertToDonorAction } from "@/app/(admin)/donors/actions";
import { CONSENT_TEXT, PII_HINT } from "@/app/(admin)/donors/labels";

interface Props {
  ticketId: string;
  brand: string;
  model: string | null;
  tagInfo: string | null;
  /** 성공 직전에 목록에서 행을 숨기고(낙관적), 실패하면 되돌린다 */
  onOptimistic: (hidden: boolean) => void;
  onCancel: () => void;
}

const inputCls = "w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

/** 폐기 확인 대기 행의 "Donor로 전환" 폼 — 소유권 포기 동의 확인 체크가 있어야 제출된다 (Q6) */
export default function DonorConvertForm({ ticketId, brand, model, tagInfo, onOptimistic, onCancel }: Props) {
  const [form, setForm] = useState({
    brand, modelText: model ?? "", tagInfo: tagInfo ?? "", conditionNote: "", storageNote: "", consent: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!form.consent) return setError("고객의 소유권 포기(폐기 위임) 동의를 확인해 주세요.");
    if (!form.brand.trim()) return setError("브랜드를 입력해 주세요.");
    setError(null);
    startTransition(async () => {
      onOptimistic(true);
      const res = await convertToDonorAction(ticketId, form);
      if (res.error) {
        onOptimistic(false);
        setError(res.error);
      }
    });
  }

  const field = (key: "brand" | "modelText" | "tagInfo" | "conditionNote" | "storageNote", label: string, max: number) => (
    <label className="block text-xs text-gray-600">
      {label}
      <input value={form[key]} maxLength={max} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputCls} />
    </label>
  );

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-white p-3">
      <p className="text-xs font-semibold text-amber-800">Donor 기기로 보관 — 부품 공급원으로 남기고 폐기 확인을 함께 처리합니다.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {field("brand", "브랜드", 50)}
        {field("modelText", "모델명", 150)}
        {field("tagInfo", "태그/라벨", 150)}
      </div>
      <p className="text-xs text-gray-500">{PII_HINT}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {field("conditionNote", "상태 메모 (예: 힌지 파손, 메인보드 정상)", 500)}
        {field("storageNote", "보관 위치 (예: DONOR 선반 1)", 100)}
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-800">
        <input
          type="checkbox"
          checked={form.consent}
          onChange={(e) => setForm({ ...form, consent: e.target.checked })}
          className="mt-0.5 h-4 w-4"
        />
        <span>{CONSENT_TEXT}</span>
      </label>
      {error && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={isPending} className="rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100">
          닫기
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !form.consent}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          Donor로 전환
        </button>
      </div>
    </div>
  );
}
