"use client";

import { useState, useTransition } from "react";
import { createCatalogModelAction } from "@/app/(admin)/catalog/actions";
import type { DeviceTypeValue } from "@/app/(admin)/catalog/actions";

export interface CreatedModel {
  modelId: string;
  variantId: string | null;
  label: string;
}

interface Props {
  defaultBrand?: string;
  defaultModel?: string;
  deviceType?: DeviceTypeValue | null;
  onCreated: (model: CreatedModel, notice: string) => void;
  onCancel: () => void;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

/** 모델 선택기 안의 "새 모델 등록" 입력 영역 (form 중첩을 피하려고 div + 버튼 사용) */
export default function NewModelInline({ defaultBrand, defaultModel, deviceType, onCreated, onCancel }: Props) {
  const [brand, setBrand] = useState(defaultBrand ?? "");
  const [model, setModel] = useState(defaultModel ?? "");
  const [variant, setVariant] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!brand.trim()) return setError("브랜드를 입력해 주세요.");
    if (!model.trim()) return setError("모델명을 입력해 주세요.");
    setError(null);
    startTransition(async () => {
      const res = await createCatalogModelAction({
        brand,
        model,
        deviceType: deviceType ?? null,
        variant: variant || null,
      });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if (!("modelId" in res) || !res.modelId) return;
      const label = [brand.trim(), model.trim(), variant.trim()].filter(Boolean).join(" · ");
      const notice = res.existed
        ? "이미 등록된 모델이 있어 해당 모델을 선택했습니다."
        : res.needsReview
          ? "새 모델이 등록되었습니다. (관리자 검토 대기)"
          : "새 모델이 등록되었습니다.";
      onCreated({ modelId: res.modelId, variantId: res.variantId ?? null, label }, notice);
    });
  }

  return (
    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <p className="mb-2 text-xs font-semibold text-blue-900">새 모델 등록</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="브랜드 (예: LG)" maxLength={50} />
        <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder="모델명 (예: 그램 15 15Z90T)" maxLength={100} />
        <input className={inputCls} value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="변형 (선택, 예: OLED)" maxLength={100} />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "등록 중..." : "등록"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100">
          취소
        </button>
      </div>
    </div>
  );
}
