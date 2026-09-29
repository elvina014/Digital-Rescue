"use client";

import { useState } from "react";
import DeviceModelPicker from "@/components/catalog/DeviceModelPicker";
import type { PickedModel } from "@/components/catalog/DeviceModelPicker";
import type { UnmappedGroup } from "../actions";

interface Suggestion {
  model_id: string;
  variant_id: string | null;
  brand_name: string;
  model_name: string;
  variant_name: string | null;
  alias: string;
  score: number;
}

interface Props {
  group: UnmappedGroup;
  onMap: (group: UnmappedGroup, model: PickedModel, alias: string) => void;
}

/** 미연결 모델 문자열 한 묶음 — 후보 선택 또는 검색/등록 후 "연결" */
export default function MappingRow({ group, onMap }: Props) {
  const [model, setModel] = useState<PickedModel | null>(null);
  const [alias, setAlias] = useState(group.raw_strings[0] ?? group.norm);
  const suggestions = (group.suggestions ?? []) as unknown as Suggestion[];

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        {group.raw_strings.map((r) => (
          <span key={r} className="rounded bg-gray-100 px-2 py-0.5 font-mono text-sm text-gray-900">{r}</span>
        ))}
        <span className="text-xs text-gray-500">
          브랜드: {group.brands.join(", ")} · 접수건 {group.ticket_count}건
          {group.test_count > 0 && ` (테스트 ${group.test_count}건 포함)`}
        </span>
      </div>

      {suggestions.length > 0 && !model && (
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs text-gray-500">후보:</span>
          {suggestions.map((s) => {
            const label = [s.brand_name, s.model_name, s.variant_name].filter(Boolean).join(" · ");
            return (
              <button
                key={`${s.model_id}-${s.variant_id ?? ""}`}
                type="button"
                onClick={() => setModel({ modelId: s.model_id, variantId: s.variant_id, label })}
                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-800 hover:bg-blue-100"
              >
                {label} <span className="text-blue-400">({Math.round(s.score * 100)}%)</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto] md:items-start">
        <DeviceModelPicker value={model} onChange={setModel} defaultBrand={group.brands[0]} />
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          maxLength={200}
          aria-label="저장할 별칭"
          title="이 문자열이 별칭으로 저장됩니다. 개인정보가 섞여 있으면 지워 주세요."
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={!model || !alias.trim()}
          onClick={() => model && onMap(group, model, alias)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          연결
        </button>
      </div>
    </li>
  );
}
