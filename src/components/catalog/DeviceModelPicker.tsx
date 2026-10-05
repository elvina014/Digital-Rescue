"use client";

import { useEffect, useState } from "react";
import { searchCatalogModelsAction, getCatalogVariantsAction } from "@/app/(admin)/catalog/actions";
import type { CatalogVariant, DeviceTypeValue } from "@/app/(admin)/catalog/actions";
import { useDebouncedSearch } from "./useDebouncedSearch";
import NewModelInline from "./NewModelInline";

export interface PickedModel {
  modelId: string;
  variantId: string | null;
  label: string;
}

interface Props {
  value: PickedModel | null;
  onChange: (value: PickedModel | null) => void;
  /** 새 모델 등록 기본값 */
  defaultBrand?: string;
  deviceType?: DeviceTypeValue | null;
  /** CS는 등록 불가 (DB에서도 차단) */
  allowCreate?: boolean;
  /** 지정하면 폼 제출용 hidden input을 렌더링 */
  modelInputName?: string;
  variantInputName?: string;
}

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

/** "표준 모델" 선택기 — 별칭 검색 + 변형 선택 + 인라인 새 모델 등록. 선택은 항상 선택사항이다. */
export default function DeviceModelPicker({
  value, onChange, defaultBrand, deviceType, allowCreate = true, modelInputName, variantInputName,
}: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [variants, setVariants] = useState<CatalogVariant[]>([]);
  const { results, error, loading } = useDebouncedSearch(query, searchCatalogModelsAction);

  const modelId = value?.modelId ?? null;
  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    getCatalogVariantsAction(modelId).then((res) => {
      if (!cancelled) setVariants(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  function pick(next: PickedModel) {
    onChange(next);
    setQuery("");
    setCreating(false);
  }

  return (
    <div>
      {modelInputName && <input type="hidden" name={modelInputName} value={value?.modelId ?? ""} />}
      {variantInputName && <input type="hidden" name={variantInputName} value={value?.variantId ?? ""} />}

      {value ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-900">{value.label}</span>
          {variants.length > 0 && (
            <select
              value={value.variantId ?? ""}
              onChange={(e) => onChange({ ...value, variantId: e.target.value || null })}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
              aria-label="변형 선택"
            >
              <option value="">변형 선택 안 함</option>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => { onChange(null); setVariants([]); setNotice(null); }} className="text-xs text-gray-500 underline hover:text-gray-700">
            해제
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="모델명·별칭으로 검색 (예: 15Z90T, 그램)"
            className={inputCls}
            aria-label="표준 모델 검색"
          />
          {query.trim() && !creating && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {loading && <li className="px-3 py-2 text-xs text-gray-400">검색 중...</li>}
              {!loading && results.length === 0 && <li className="px-3 py-2 text-xs text-gray-500">일치하는 모델이 없습니다.</li>}
              {results.map((r) => {
                const label = [r.brand_name, r.model_name, r.variant_name].filter(Boolean).join(" · ");
                return (
                  <li key={`${r.model_id}-${r.variant_id ?? ""}`}>
                    <button
                      type="button"
                      onClick={() => pick({ modelId: r.model_id, variantId: r.variant_id, label })}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
                    >
                      {label}
                      {r.matched !== r.model_name && <span className="ml-2 text-xs text-gray-400">({r.matched})</span>}
                    </button>
                  </li>
                );
              })}
              {allowCreate && (
                <li className="border-t border-gray-100">
                  <button type="button" onClick={() => setCreating(true)} className="w-full px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50">
                    + 새 모델 등록
                  </button>
                </li>
              )}
            </ul>
          )}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      )}

      {creating && !value && (
        <NewModelInline
          defaultBrand={defaultBrand}
          defaultModel={query}
          deviceType={deviceType}
          onCreated={(m, msg) => { pick(m); setNotice(msg); }}
          onCancel={() => setCreating(false)}
        />
      )}
      {notice && <p className="mt-1 text-xs text-blue-700">{notice}</p>}
    </div>
  );
}
