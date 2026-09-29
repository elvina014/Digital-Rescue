"use client";

import { useState } from "react";
import BoardPicker from "@/components/catalog/BoardPicker";
import {
  addCatalogVariantAction, deleteCatalogVariantAction, addCatalogModelAliasAction,
  deleteCatalogModelAliasAction, linkModelBoardAction, unlinkModelBoardAction,
} from "../adminActions";
import ChipList from "../ChipList";
import { useOptimisticRemove } from "../useOptimisticRemove";
import type { ModelRow } from "./types";

/** 선택한 모델의 변형·별칭·연결 보드 편집 */
export default function ModelLinks({ model }: { model: ModelRow }) {
  const { isHidden, remove } = useOptimisticRemove();
  const [error, setError] = useState<string | null>(null);
  const variantName = (id: string | null) => model.variants.find((v) => v.id === id)?.name;

  async function del(id: string, action: () => Promise<{ error?: string }>) {
    setError(await remove(id, action));
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}</p>}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">변형</h3>
        <ChipList
          chips={model.variants.map((v) => ({ id: v.id, label: v.name }))}
          isHidden={isHidden}
          onRemove={(id) => del(id, () => deleteCatalogVariantAction(id))}
          addPlaceholder="변형 추가 (예: OLED, LCD 터치)"
          onAdd={async (v) => (await addCatalogVariantAction(model.id, v)).error ?? null}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">별칭</h3>
        <p className="mb-2 text-xs text-gray-500">검색·매핑에 쓰입니다. 대소문자·공백·기호 차이는 같은 별칭으로 봅니다.</p>
        <ChipList
          chips={model.aliases.map((a) => ({
            id: a.id,
            label: a.alias,
            hint: [a.source === "mapping" ? "매핑" : a.source === "created" ? "등록명" : "", variantName(a.variantId)].filter(Boolean).join(" · ") || undefined,
          }))}
          isHidden={isHidden}
          onRemove={(id) => del(id, () => deleteCatalogModelAliasAction(id))}
          addPlaceholder="별칭 추가 (예: 15Z90T-GA5HK)"
          onAdd={async (v) => (await addCatalogModelAliasAction(model.id, v, null)).error ?? null}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-800">연결된 메인보드</h3>
        <ChipList
          chips={model.boards.map((b) => ({ id: b.id, label: b.boardNumber, hint: variantName(b.variantId) }))}
          isHidden={isHidden}
          onRemove={(id) => del(id, () => unlinkModelBoardAction(id))}
        />
        <div className="mt-2">
          <BoardPicker
            value={null}
            onChange={async (b) => {
              if (!b) return;
              const res = await linkModelBoardAction(model.id, b.boardId, null);
              setError(res.error ?? null);
            }}
          />
        </div>
      </div>
    </div>
  );
}
