"use client";

import { useState, useTransition } from "react";
import { saveRepairRecordAction } from "./actions";
import { FAULT_CATEGORY_LABEL, RESULT_LABEL, INPUT_CLASS, type RepairRecordRow } from "./labels";

interface Props {
  ticketId: string;
  record: RepairRecordRow | null;
  canEdit: boolean;
}

/** 진단 요약 · 고장 분류 · 결과 · 비고 · 적출 부품 확인 */
export default function RecordSummaryForm({ ticketId, record, canEdit }: Props) {
  const initial = {
    diagnosisSummary: record?.diagnosis_summary ?? "",
    faultCategory: record?.fault_category ?? "",
    result: record?.result ?? "",
    notes: record?.notes ?? "",
    removedPartsConfirmed: record?.removed_parts_confirmed ?? false,
  };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  function save() {
    startTransition(async () => {
      setMessage(null);
      const res = await saveRepairRecordAction(ticketId, form);
      if (res.error) {
        setMessage({ ok: false, text: res.error });
      } else {
        setSaved(form);
        setMessage({ ok: true, text: "저장되었습니다." });
      }
    });
  }

  if (!canEdit) {
    return (
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Item label="진단 요약" value={record?.diagnosis_summary} wide />
        <Item label="고장 분류" value={record?.fault_category ? FAULT_CATEGORY_LABEL[record.fault_category] : null} />
        <Item label="결과" value={record?.result ? RESULT_LABEL[record.result] : null} />
        <Item label="비고" value={record?.notes} wide />
        <Item label="적출 부품 확인" value={record?.removed_parts_confirmed ? "확인됨" : "미확인"} />
      </dl>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">진단 요약</label>
        <textarea
          rows={2}
          value={form.diagnosisSummary}
          onChange={(e) => set("diagnosisSummary", e.target.value)}
          placeholder="예: 충전 IC 쇼트로 전원 불가. 고객 개인정보는 적지 마세요."
          className={`w-full ${INPUT_CLASS}`}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">고장 분류</label>
          <select value={form.faultCategory} onChange={(e) => set("faultCategory", e.target.value)} className={`w-full ${INPUT_CLASS}`}>
            <option value="">선택</option>
            {Object.entries(FAULT_CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">결과</label>
          <select value={form.result} onChange={(e) => set("result", e.target.value)} className={`w-full ${INPUT_CLASS}`}>
            <option value="">선택</option>
            {Object.entries(RESULT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">비고</label>
        <textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={`w-full ${INPUT_CLASS}`} />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.removedPartsConfirmed}
          onChange={(e) => set("removedPartsConfirmed", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
        적출 부품을 모두 기재했습니다 (적출 부품이 없는 경우 포함)
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending || !dirty}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "저장 중..." : "수리 기록 저장"}
        </button>
        {dirty && !isPending && <span className="text-xs text-amber-600">저장하지 않은 변경이 있습니다.</span>}
        {message && <span className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>{message.text}</span>}
      </div>
    </div>
  );
}

function Item({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="whitespace-pre-wrap text-gray-900">{value || <span className="text-gray-400">-</span>}</dd>
    </div>
  );
}
