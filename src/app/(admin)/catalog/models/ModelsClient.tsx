"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import NewModelInline from "@/components/catalog/NewModelInline";
import ModelEditor from "./ModelEditor";
import type { ModelRow } from "./types";

/** 모델 목록 (필터: 브랜드 / 검토 필요 / 검색어) + 선택한 모델 편집 */
export default function ModelsClient({ models }: { models: ModelRow[] }) {
  const router = useRouter();
  const [brand, setBrand] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [text, setText] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const brands = useMemo(() => Array.from(new Set(models.map((m) => m.brand))).sort(), [models]);
  const visible = models.filter((m) => {
    if (brand && m.brand !== brand) return false;
    if (reviewOnly && !m.needsReview) return false;
    const t = text.trim().toLowerCase();
    return !t || m.name.toLowerCase().includes(t) || m.aliases.some((a) => a.alias.toLowerCase().includes(t));
  });
  const selected = models.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
      <section>
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" aria-label="브랜드">
            <option value="">전체 브랜드</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="모델명·별칭 검색" className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          <label className="flex items-center gap-1 text-sm text-gray-700">
            <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} /> 검토 필요만
          </label>
          <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
            + 새 모델
          </button>
        </div>
        {creating && (
          <NewModelInline
            onCreated={(m, msg) => { setCreating(false); setNotice(msg); setSelectedId(m.modelId); router.refresh(); }}
            onCancel={() => setCreating(false)}
          />
        )}
        {notice && <p className="mb-2 text-xs text-blue-700">{notice}</p>}
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {visible.length === 0 && <li className="p-4 text-sm text-gray-500">표시할 모델이 없습니다.</li>}
          {visible.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setSelectedId(m.id)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-gray-50 ${m.id === selectedId ? "bg-blue-50" : ""}`}
              >
                <span>
                  <span className="text-gray-500">{m.brand}</span> <span className="text-gray-900">{m.name}</span>
                  {m.needsReview && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">검토 필요</span>}
                </span>
                <span className="text-xs text-gray-500">접수건 {m.ticketCount} · 별칭 {m.aliases.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        {selected ? (
          <ModelEditor key={selected.id} model={selected} onDeleted={() => setSelectedId(null)} />
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">왼쪽에서 모델을 선택하면 편집할 수 있습니다.</p>
        )}
      </section>
    </div>
  );
}
