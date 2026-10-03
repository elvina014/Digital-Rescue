"use client";

import { useState } from "react";
import DeviceModelPicker from "@/components/catalog/DeviceModelPicker";
import type { PickedModel } from "@/components/catalog/DeviceModelPicker";
import BoardPicker from "@/components/catalog/BoardPicker";
import type { PickedBoard } from "@/components/catalog/BoardPicker";
import PartSpecPicker from "@/components/catalog/PartSpecPicker";
import type { PickedPartSpec } from "@/components/catalog/PartSpecPicker";
import DeviceKnowledgePanel from "@/components/knowledge/DeviceKnowledgePanel";
import PartsForDeviceList from "@/components/knowledge/PartsForDeviceList";
import DevicesForPartList from "@/components/knowledge/DevicesForPartList";

interface Props {
  canWriteNotes: boolean;
  canOpenDonors: boolean;
  authorName: string;
}

const TABS = [
  { key: "device", label: "기기로 부품 찾기" },
  { key: "part", label: "부품으로 기기 찾기" },
] as const;

export default function LookupClient({ canWriteNotes, canOpenDonors, authorName }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("device");
  const [model, setModel] = useState<PickedModel | null>(null);
  const [board, setBoard] = useState<PickedBoard | null>(null);
  const [spec, setSpec] = useState<PickedPartSpec | null>(null);

  const target = { modelId: model?.modelId ?? null, variantId: model?.variantId ?? null, boardId: board?.boardId ?? null };
  const hasTarget = Boolean(target.modelId || target.boardId);

  return (
    <div className="mt-4">
      <div className="flex gap-1 border-b border-gray-200" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t.key ? "border-blue-600 font-semibold text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "device" ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">표준 모델 <span className="text-xs text-gray-400">(모델명·별칭 일부 입력)</span></span>
              <DeviceModelPicker value={model} onChange={setModel} allowCreate={false} />
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-gray-700">메인보드 <span className="text-xs text-gray-400">(보드 번호·별칭)</span></span>
              <BoardPicker value={board} onChange={setBoard} />
            </div>
          </div>
          {!hasTarget ? (
            <p className="text-sm text-gray-500">모델 또는 보드를 선택해 주세요.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">호환 부품</h3>
                <PartsForDeviceList target={target} />
              </section>
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">기기 지식</h3>
                <DeviceKnowledgePanel target={target} canWriteNotes={canWriteNotes} canOpenDonors={canOpenDonors} authorName={authorName} />
              </section>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <span className="mb-1 block text-sm font-medium text-gray-700">부품 규격 <span className="text-xs text-gray-400">(품번·칩 마킹·별칭 일부 입력)</span></span>
            <PartSpecPicker value={spec} onChange={setSpec} allowCreate={false} />
          </div>
          {spec ? (
            <DevicesForPartList key={spec.partSpecId} partSpecId={spec.partSpecId} canOpenDonors={canOpenDonors} />
          ) : (
            <p className="text-sm text-gray-500">부품 규격을 선택해 주세요.</p>
          )}
        </div>
      )}
    </div>
  );
}
