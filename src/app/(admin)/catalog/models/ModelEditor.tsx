"use client";

import { useState, useTransition } from "react";
import { updateCatalogModelAction, deleteCatalogModelAction } from "../adminActions";
import type { DeviceTypeValue } from "../actions";
import ModelLinks from "./ModelLinks";
import type { ModelRow } from "./types";

const DEVICE_TYPES: DeviceTypeValue[] = ["노트북", "데스크탑", "태블릿", "서버", "나스", "기타저장장치"];
const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm";

/** 모델 기본 정보 편집 + 삭제 (+ 변형/별칭/보드는 ModelLinks) */
export default function ModelEditor({ model, onDeleted }: { model: ModelRow; onDeleted: () => void }) {
  const [name, setName] = useState(model.name);
  const [deviceType, setDeviceType] = useState<DeviceTypeValue | "">(model.deviceType ?? "");
  const [year, setYear] = useState(model.releaseYear ? String(model.releaseYear) : "");
  const [notes, setNotes] = useState(model.notes ?? "");
  const [needsReview, setNeedsReview] = useState(model.needsReview);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const releaseYear = year.trim() ? Number(year) : null;
    if (releaseYear !== null && !Number.isInteger(releaseYear)) {
      setMessage({ ok: false, text: "출시 연도는 숫자로 입력해 주세요." });
      return;
    }
    startTransition(async () => {
      const res = await updateCatalogModelAction(model.id, {
        name, deviceType: deviceType || null, releaseYear, notes, needsReview,
      });
      setMessage(res.error ? { ok: false, text: res.error } : { ok: true, text: "저장했습니다." });
    });
  }

  function handleDelete() {
    if (!confirm(`[${model.brand} ${model.name}] 모델을 삭제할까요? 별칭·변형·보드 연결도 함께 삭제됩니다.`)) return;
    startTransition(async () => {
      const res = await deleteCatalogModelAction(model.id);
      if (res.error) setMessage({ ok: false, text: res.error });
      else onDeleted();
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500">{model.brand}</p>
          <h2 className="text-base font-semibold text-gray-900">{model.name}</h2>
          <p className="text-xs text-gray-500">연결된 접수건 {model.ticketCount}건</p>
        </div>
        <button type="button" onClick={handleDelete} disabled={isPending || model.ticketCount > 0}
          title={model.ticketCount > 0 ? "접수건이 연결된 모델은 삭제할 수 없습니다." : undefined}
          className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40">
          삭제
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-600 sm:col-span-2">모델명
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
        </label>
        <label className="text-xs text-gray-600">기기 종류
          <select className={inputCls} value={deviceType} onChange={(e) => setDeviceType(e.target.value as DeviceTypeValue | "")}>
            <option value="">미지정</option>
            {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">출시 연도
          <input className={inputCls} value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" maxLength={4} placeholder="예: 2022" />
        </label>
        <label className="text-xs text-gray-600 sm:col-span-2">메모
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} /> 검토 필요
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={handleSave} disabled={isPending} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {isPending ? "저장 중..." : "저장"}
        </button>
        {message && <span className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span>}
      </div>

      <hr className="my-5 border-gray-100" />
      <ModelLinks model={model} />
    </div>
  );
}
