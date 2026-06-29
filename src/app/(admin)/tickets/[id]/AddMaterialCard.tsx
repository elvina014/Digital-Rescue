"use client";

import { useState, useMemo, useTransition } from "react";
import { addTicketMaterialsAction } from "../actions";

// ─── 타입 ───

interface InventoryItemRow {
  id: string;
  category_id: string;
  spec_id: string;
  product_id: string;
  capacity: string | null;
  condition: string;
  quantity: number;
  base_estimate: number;
  category_name: string;
  spec_name: string;
  product_name: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

export interface InsertedMaterial {
  id: string;
  inventory_item_id: string;
  quantity: number;
  request_status: string;
  request_type: string;
}

interface SelectedMaterial {
  inventoryItemId: string;
  quantity: number;
}

interface AddMaterialCardProps {
  ticketId: string;
  categories: CategoryOption[];
  inventoryItems: InventoryItemRow[];
  onAdded: (inserted: InsertedMaterial[]) => void;
  onError: (msg: string | null) => void;
}

// ─── 컴포넌트: 수리 진행 중 주요 수리 부위 추가 선택 ───

export default function AddMaterialCard({
  ticketId,
  categories,
  inventoryItems,
  onAdded,
  onError,
}: AddMaterialCardProps) {
  const [isPending, startTransition] = useTransition();

  // 카테고리 체크박스
  const [checkedCategories, setCheckedCategories] = useState<Set<string>>(new Set());
  // 자재 선택 (categoryId → {inventoryItemId, quantity})
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedMaterial>>(new Map());

  function toggleCategory(catId: string) {
    setCheckedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
        setSelectedItems((m) => {
          const nm = new Map(m);
          nm.delete(catId);
          return nm;
        });
      } else {
        next.add(catId);
      }
      return next;
    });
  }

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, InventoryItemRow[]>();
    for (const item of inventoryItems) {
      if (!map.has(item.category_id)) map.set(item.category_id, []);
      map.get(item.category_id)!.push(item);
    }
    return map;
  }, [inventoryItems]);

  function itemLabel(item: InventoryItemRow) {
    const parts = [item.spec_name, item.product_name];
    if (item.capacity) parts.push(item.capacity);
    parts.push(`(${item.condition === "NEW" ? "신품" : "중고"})`);
    parts.push(`— ${item.base_estimate.toLocaleString()}원`);
    parts.push(item.quantity <= 0 ? `[재고 0]` : `[재고: ${item.quantity}]`);
    return parts.join(" ");
  }

  function handleAdd() {
    const materials = Array.from(selectedItems.values()).map((sel) => {
      const item = inventoryItems.find((i) => i.id === sel.inventoryItemId);
      return {
        inventory_item_id: sel.inventoryItemId,
        quantity: sel.quantity,
        request_type: item && item.quantity <= 0 ? "purchase" : "dispatch",
      };
    });

    if (materials.length === 0) {
      onError("추가할 자재를 선택해 주세요.");
      return;
    }

    startTransition(async () => {
      onError(null);
      const res = await addTicketMaterialsAction(ticketId, materials);
      if (res?.error) {
        onError(res.error);
        return;
      }
      onAdded(res.inserted ?? []);
      // 선택 초기화
      setCheckedCategories(new Set());
      setSelectedItems(new Map());
    });
  }

  const hasSelection = selectedItems.size > 0;

  return (
    <section className="rounded-xl border-2 border-yellow-300 bg-yellow-50 p-5">
      <h2 className="mb-1 text-base font-semibold text-yellow-900">주요 수리 부위 추가</h2>
      <p className="mb-4 text-xs text-yellow-700">
        수리 계획 변경으로 추가 재고가 필요하면 부위를 선택해 추가하세요. 추가 후 아래 자재비 관리에서 출고/구매 요청을 진행할 수 있습니다.
      </p>

      {/* ─── 주요 수리 부위 (카테고리 체크박스) ─── */}
      <div className="mb-4 rounded-lg border border-yellow-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-800">주요 수리 부위</h3>
        {categories.length === 0 ? (
          <p className="text-sm text-gray-400">등록된 재고 카테고리가 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {categories.map((cat) => (
              <label
                key={cat.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  checkedCategories.has(cat.id)
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checkedCategories.has(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                  className="accent-blue-600"
                />
                {cat.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* ─── 재고 선택 (체크된 카테고리별 드롭다운) ─── */}
      {checkedCategories.size > 0 && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">자재 선택</h3>
          <div className="space-y-3">
            {Array.from(checkedCategories).map((catId) => {
              const catName = categories.find((c) => c.id === catId)?.name ?? catId;
              const items = itemsByCategory.get(catId) ?? [];
              const selected = selectedItems.get(catId);
              return (
                <div key={catId} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <label className="mb-1 block text-xs font-medium text-gray-600">{catName}</label>
                  {items.length === 0 ? (
                    <p className="text-xs text-gray-400">해당 카테고리에 등록된 재고가 없습니다.</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={selected?.inventoryItemId ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedItems((prev) => {
                            const next = new Map(prev);
                            if (!val) {
                              next.delete(catId);
                            } else {
                              next.set(catId, {
                                inventoryItemId: val,
                                quantity: selected?.quantity ?? 1,
                              });
                            }
                            return next;
                          });
                        }}
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="">선택 안 함</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {itemLabel(item)}
                          </option>
                        ))}
                      </select>
                      {selected && (
                        <input
                          type="number"
                          min={1}
                          max={(() => {
                            const inv = inventoryItems.find((i) => i.id === selected.inventoryItemId);
                            return inv && inv.quantity > 0 ? inv.quantity : 99;
                          })()}
                          value={selected.quantity}
                          onChange={(e) => {
                            const qty = Math.max(1, Number(e.target.value) || 1);
                            setSelectedItems((prev) => {
                              const next = new Map(prev);
                              next.set(catId, { ...selected, quantity: qty });
                              return next;
                            });
                          }}
                          className="w-20 rounded-lg border border-gray-300 px-2 py-2 text-center text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          title="수량"
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 추가 버튼 ─── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending || !hasSelection}
          className="rounded-lg bg-yellow-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-yellow-600 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:opacity-50"
        >
          {isPending ? "추가 중..." : "선택 자재 추가"}
        </button>
      </div>
    </section>
  );
}
