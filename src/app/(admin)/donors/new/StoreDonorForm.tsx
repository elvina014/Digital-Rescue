"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import DeviceModelPicker, { type PickedModel } from "@/components/catalog/DeviceModelPicker";
import BoardPicker, { type PickedBoard } from "@/components/catalog/BoardPicker";
import { Constants } from "@/types/supabase";
import type { DeviceTypeValue } from "@/app/(admin)/catalog/actions";
import type { LocationOption } from "@/app/(admin)/scan/LocationSelect";
import { registerStoreDonorAction } from "../actions";
import { OWNED_TEXT, PII_HINT } from "../labels";

const inputCls = "w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";
const DEVICE_TYPES = Constants.public.Enums.device_type;

const EMPTY = {
  deviceType: "" as DeviceTypeValue | "",
  brand: "", modelText: "", tagInfo: "", conditionNote: "", storageNote: "", storageLocationId: "",
  acquisitionNote: "", acquiredOn: "", acquisitionCost: "",
};

/** 매장 보관 기기 등록 폼 — 저장 성공 시 Donor 상세로 이동, 실패 시 입력값 유지 */
export default function StoreDonorForm({ locations }: { locations: LocationOption[] }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [model, setModel] = useState<PickedModel | null>(null);
  const [board, setBoard] = useState<PickedBoard | null>(null);
  const [owned, setOwned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  function submit() {
    if (!form.deviceType) return setError("기기 종류를 선택해 주세요.");
    if (!form.brand.trim()) return setError("브랜드를 입력해 주세요.");
    if (!form.acquisitionNote.trim()) return setError("취득 경위를 입력해 주세요.");
    if (!owned) return setError("회사 소유 기기임을 확인해 주세요.");
    setError(null);
    startTransition(async () => {
      const res = await registerStoreDonorAction({
        ...form,
        owned,
        catalogModelId: model?.modelId ?? null,
        catalogVariantId: model?.variantId ?? null,
        catalogBoardId: board?.boardId ?? null,
        storageLocationId: form.storageLocationId || null,
      });
      if (res.error || !res.donorId) return setError(res.error ?? "등록에 실패했습니다.");
      router.push(`/donors/${res.donorId}`);
    });
  }

  return (
    <section className="mt-4 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-gray-600">
          기기 종류 <span className="text-red-500">*</span>
          <select value={form.deviceType} onChange={set("deviceType")} className={inputCls}>
            <option value="">선택하세요</option>
            {DEVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="block text-xs text-gray-600">
          브랜드 <span className="text-red-500">*</span>
          <input value={form.brand} maxLength={50} onChange={set("brand")} placeholder="예: Lenovo" className={inputCls} />
        </label>
        <label className="block text-xs text-gray-600">
          모델명
          <input value={form.modelText} maxLength={150} onChange={set("modelText")} placeholder="예: 14ARH7" className={inputCls} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="text-xs text-gray-600">
          표준 모델
          <DeviceModelPicker value={model} onChange={setModel} defaultBrand={form.brand} deviceType={form.deviceType || null} />
        </div>
        <div className="text-xs text-gray-600">
          메인보드
          <BoardPicker value={board} onChange={setBoard} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-gray-600">
          태그/라벨
          <input value={form.tagInfo} maxLength={150} onChange={set("tagInfo")} className={inputCls} />
        </label>
        <label className="block text-xs text-gray-600">
          보관 위치
          <select value={form.storageLocationId} onChange={set("storageLocationId")} className={inputCls}>
            <option value="">미지정</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.code}{l.description ? ` — ${l.description}` : ""}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-gray-600">
          보관 메모
          <input value={form.storageNote} maxLength={100} onChange={set("storageNote")} className={inputCls} />
        </label>
      </div>
      <label className="block text-xs text-gray-600">
        상태 메모
        <input value={form.conditionNote} onChange={set("conditionNote")} placeholder="예: 액정 정상, 보드 불량" className={inputCls} />
      </label>

      <fieldset className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <legend className="px-1 text-xs font-semibold text-amber-900">회사 자산 정보</legend>
        <label className="block text-xs text-gray-700">
          취득 경위 <span className="text-red-500">*</span>
          <input value={form.acquisitionNote} maxLength={300} onChange={set("acquisitionNote")}
            placeholder="예: 2023년 부품용 매입 / 출처 불명 장기 보관 / 옛 접수 R-2024-0012 폐기분" className={inputCls} />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-gray-700">
            취득일
            <input type="date" value={form.acquiredOn} onChange={set("acquiredOn")} className={inputCls} />
          </label>
          <label className="block text-xs text-gray-700">
            취득가 (원)
            <input inputMode="numeric" value={form.acquisitionCost} onChange={set("acquisitionCost")} placeholder="모르면 비워 두세요" className={inputCls} />
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500">취득가는 기록용입니다. 적출한 부품의 재고 금액(기초견적)에는 반영되지 않습니다.</p>
      </fieldset>

      <label className="flex items-start gap-2 text-sm text-gray-800">
        <input type="checkbox" checked={owned} onChange={(e) => setOwned(e.target.checked)} className="mt-0.5" />
        <span>{OWNED_TEXT} <span className="text-red-500">*</span></span>
      </label>

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-gray-400">{PII_HINT}</span>
        {error && <span className="text-sm text-red-600">{error}</span>}
        <button type="button" onClick={submit} disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {isPending ? "등록 중..." : "등록"}
        </button>
      </div>
    </section>
  );
}
