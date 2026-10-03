"use client";

import { useState } from "react";
import type { PickedModel } from "@/components/catalog/DeviceModelPicker";
import DeviceKnowledgePanel from "./DeviceKnowledgePanel";

interface Props {
  model: PickedModel | null;
  canWriteNotes: boolean;
  canOpenDonors: boolean;
  authorName: string;
}

/** 접수 사전 확인 — 표준 모델을 고르면 표시. 표시 전용이며 접수 저장에는 관여하지 않는다 */
export default function IntakePrecheck({ model, canWriteNotes, canOpenDonors, authorName }: Props) {
  const [open, setOpen] = useState(true);
  if (!model) return null;
  return (
    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left" aria-expanded={open}>
        <span className="text-sm font-semibold text-blue-900">사전 확인 · {model.label}</span>
        <span className="text-xs text-blue-700">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="mt-3">
          <DeviceKnowledgePanel target={{ modelId: model.modelId, variantId: model.variantId, boardId: null }}
            canWriteNotes={canWriteNotes} canOpenDonors={canOpenDonors} authorName={authorName} compact />
        </div>
      )}
    </div>
  );
}
