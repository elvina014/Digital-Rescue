"use client";

import { useState, useTransition } from "react";
import DeviceModelPicker, { type PickedModel } from "@/components/catalog/DeviceModelPicker";
import BoardPicker, { type PickedBoard } from "@/components/catalog/BoardPicker";
import type { DeviceTypeValue } from "@/app/(admin)/catalog/actions";
import { updateDonorAction } from "../actions";
import { DONOR_STATUS_LABEL, PII_HINT } from "../labels";

interface DonorInfo {
  id: string;
  brand: string;
  modelText: string;
  tagInfo: string;
  status: string;
  conditionNote: string;
  storageNote: string;
  deviceType: DeviceTypeValue;
  model: PickedModel | null;
  board: PickedBoard | null;
}

const inputCls = "w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50";

/** Donor 기본 정보 — 관리자/팀장만 수정 (보관 상태, 위치, 표준 모델/보드) */
export default function DonorInfoForm({ donor, canEdit }: { donor: DonorInfo; canEdit: boolean }) {
  const [form, setForm] = useState(donor);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (!form.brand.trim()) return setMessage({ ok: false, text: "브랜드를 입력해 주세요." });
    startTransition(async () => {
      const res = await updateDonorAction(donor.id, {
        brand: form.brand, modelText: form.modelText, tagInfo: form.tagInfo, status: form.status,
        conditionNote: form.conditionNote, storageNote: form.storageNote,
        catalogModelId: form.model?.modelId ?? null, catalogVariantId: form.model?.variantId ?? null, catalogBoardId: form.board?.boardId ?? null,
      });
      if (res.error) {
        setForm(donor); // 저장 실패 → 서버 값으로 되돌림
        setMessage({ ok: false, text: res.error });
      } else {
        setMessage({ ok: true, text: "저장되었습니다." });
      }
    });
  }

  const field = (key: "brand" | "modelText" | "tagInfo" | "storageNote", label: string, max: number) => (
    <label className="block text-xs text-gray-600">
      {label}
      <input value={form[key]} maxLength={max} disabled={!canEdit} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputCls} />
    </label>
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-base font-semibold text-gray-900">기기 정보</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        {field("brand", "브랜드", 50)}
        {field("modelText", "모델명", 150)}
        {field("tagInfo", "태그/라벨", 150)}
        <label className="block text-xs text-gray-600">
          보관 상태
          <select value={form.status} disabled={!canEdit} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
            {Object.entries(DONOR_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {field("storageNote", "보관 위치", 100)}
        <label className="block text-xs text-gray-600">
          상태 메모
          <input value={form.conditionNote} disabled={!canEdit} onChange={(e) => setForm({ ...form, conditionNote: e.target.value })} className={inputCls} />
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="text-xs text-gray-600">
          표준 모델
          {canEdit ? (
            <DeviceModelPicker value={form.model} onChange={(model) => setForm({ ...form, model })} defaultBrand={form.brand} deviceType={form.deviceType} />
          ) : (
            <p className="mt-1 text-sm text-gray-800">{form.model?.label ?? "미연결"}</p>
          )}
        </div>
        <div className="text-xs text-gray-600">
          메인보드
          {canEdit ? (
            <BoardPicker value={form.board} onChange={(board) => setForm({ ...form, board })} />
          ) : (
            <p className="mt-1 text-sm text-gray-800">{form.board?.label ?? "미연결"}</p>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <span className="text-xs text-gray-400">{PII_HINT}</span>
          {message && <span className={`text-sm ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span>}
          <button type="button" onClick={save} disabled={isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            저장
          </button>
        </div>
      )}
    </section>
  );
}
