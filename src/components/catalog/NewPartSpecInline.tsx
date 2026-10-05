"use client";

import { useState, useTransition } from "react";
import { createPartSpecAction } from "@/app/(admin)/catalog/partActions";
import { PART_TYPE_LABEL } from "./partLabels";

export interface CreatedPartSpec {
  partSpecId: string;
  label: string;
  compatTarget: "MODEL" | "BOARD";
}

interface Props {
  defaultName?: string;
  onCreated: (spec: CreatedPartSpec, notice: string) => void;
  onCancel: () => void;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

/** 부품 규격 선택기 안의 "새 부품 규격 등록" 입력 영역 (form 중첩을 피하려고 div + 버튼 사용) */
export default function NewPartSpecInline({ defaultName, onCreated, onCancel }: Props) {
  const [partType, setPartType] = useState("");
  const [name, setName] = useState(defaultName ?? "");
  const [manufacturer, setManufacturer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!partType) return setError("부품 종류를 선택해 주세요.");
    if (!name.trim()) return setError("품번(명칭)을 입력해 주세요.");
    setError(null);
    startTransition(async () => {
      const res = await createPartSpecAction({ partType, name, manufacturer });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      if (!("partSpecId" in res) || !res.partSpecId) return;
      const notice = res.existed
        ? "이미 등록된 부품 규격이 있어 해당 규격을 선택했습니다."
        : res.needsReview
          ? "새 부품 규격이 등록되었습니다. (관리자 검토 대기)"
          : "새 부품 규격이 등록되었습니다.";
      onCreated(
        { partSpecId: res.partSpecId, label: `${PART_TYPE_LABEL[partType]} · ${name.trim()}`, compatTarget: partType === "IC" ? "BOARD" : "MODEL" },
        notice
      );
    });
  }

  return (
    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
      <p className="mb-2 text-xs font-semibold text-blue-900">새 부품 규격 등록</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select className={inputCls} value={partType} onChange={(e) => setPartType(e.target.value)} aria-label="부품 종류">
          <option value="">부품 종류</option>
          {Object.entries(PART_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="품번/명칭 (예: LP140WF7-SPB1)" maxLength={150} />
        <input className={inputCls} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="제조사 (선택)" maxLength={50} />
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
