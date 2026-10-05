"use client";

import { useState, useTransition } from "react";
import { ALIAS_TYPE_LABEL, COMPAT_TARGET_LABEL, PART_TYPE_LABEL } from "@/components/catalog/partLabels";
import { addPartAliasAction, deletePartAliasAction, deletePartSpecAction, updatePartSpecAction } from "../partActions";
import ChipList from "../ChipList";
import { useOptimisticRemove } from "../useOptimisticRemove";
import CompatibilityPanel from "./CompatibilityPanel";
import type { GroupOption, PartSpecRow } from "./types";

const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm";

/** 부품 규격 기본 정보·별칭 편집 + 삭제 (+ 호환성은 CompatibilityPanel) */
export default function PartSpecEditor({ spec, groups, onDeleted }: { spec: PartSpecRow; groups: GroupOption[]; onDeleted: () => void }) {
  const [name, setName] = useState(spec.name);
  const [manufacturer, setManufacturer] = useState(spec.manufacturer ?? "");
  const [compatTarget, setCompatTarget] = useState<string>(spec.compatTarget);
  const [groupId, setGroupId] = useState(spec.groupId ?? "");
  const [description, setDescription] = useState(spec.description ?? "");
  const [needsReview, setNeedsReview] = useState(spec.needsReview);
  const [aliasType, setAliasType] = useState("PART_NUMBER");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const { isHidden, remove } = useOptimisticRemove();
  const hasCompat = spec.compat.some((c) => !c.is_candidate);

  function handleSave() {
    startTransition(async () => {
      const res = await updatePartSpecAction(spec.id, { name, manufacturer, compatTarget, interchangeGroupId: groupId || null, description, needsReview });
      setMessage(res.error ? { ok: false, text: res.error } : { ok: true, text: "저장했습니다." });
    });
  }

  function handleDelete() {
    if (!confirm(`[${spec.name}] 부품 규격을 삭제할까요? 별칭도 함께 삭제됩니다.`)) return;
    startTransition(async () => {
      const res = await deletePartSpecAction(spec.id);
      if (res.error) setMessage({ ok: false, text: res.error });
      else onDeleted();
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500">{PART_TYPE_LABEL[spec.partType] ?? spec.partType}</p>
          <h2 className="text-base font-semibold text-gray-900">{spec.name}</h2>
        </div>
        <button type="button" onClick={handleDelete} disabled={isPending || hasCompat}
          title={hasCompat ? "호환성 근거가 있는 규격은 삭제할 수 없습니다." : undefined}
          className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40">
          삭제
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-600">대표 품번/명칭
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
        </label>
        <label className="text-xs text-gray-600">제조사
          <input className={inputCls} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} maxLength={50} />
        </label>
        <label className="text-xs text-gray-600">호환 기준
          <select className={inputCls} value={compatTarget} onChange={(e) => setCompatTarget(e.target.value)} disabled={hasCompat}
            title={hasCompat ? "호환성 근거가 있으면 기준을 바꿀 수 없습니다." : undefined}>
            {Object.entries(COMPAT_TARGET_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600">호환 그룹
          <select className={inputCls} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">없음</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600 sm:col-span-2">설명
          <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
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

      <div className="mb-1 mt-5 flex items-center gap-2">
        <p className="text-xs font-semibold text-gray-600">별칭 (품번·칩 마킹)</p>
        <select value={aliasType} onChange={(e) => setAliasType(e.target.value)} className="rounded border border-gray-300 px-1.5 py-0.5 text-xs" aria-label="추가할 별칭 종류">
          {Object.entries(ALIAS_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>추가 종류: {v}</option>)}
        </select>
      </div>
      <ChipList
        chips={spec.aliases.map((a) => ({ id: a.id, label: a.alias, hint: ALIAS_TYPE_LABEL[a.aliasType] }))}
        isHidden={isHidden}
        onRemove={async (id) => {
          const err = await remove(id, () => deletePartAliasAction(id));
          if (err) setMessage({ ok: false, text: err });
        }}
        addPlaceholder="별칭 추가 (예: BQ780S)"
        onAdd={async (v) => (await addPartAliasAction(spec.id, v, aliasType)).error ?? null}
      />

      <hr className="my-5 border-gray-100" />
      <CompatibilityPanel spec={spec} />
    </div>
  );
}
