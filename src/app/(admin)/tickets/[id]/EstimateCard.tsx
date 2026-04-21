"use client";

import { useState, useMemo, useTransition, useCallback, useRef } from "react";
import { startRepairAction, lookupPastEvaluatedValue } from "../actions";
import { DeviceType } from "@/types";

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

interface GlobalSettingsData {
  base_service_cost: number;
  value_reference_amount: number;
  discount_surcharge_rate: number;
}

interface EstimateCardProps {
  ticketId: string;
  currentDeviceBrand: string | null;
  currentDeviceModel: string | null;
  categories: CategoryOption[];
  inventoryItems: InventoryItemRow[];
  globalSettings: GlobalSettingsData;
  onError: (msg: string) => void;
}

// ─── 선택된 자재 아이템 타입 ───

interface SelectedMaterial {
  inventoryItemId: string;
  quantity: number;
}

// ─── 컴포넌트 ───

export default function EstimateCard({
  ticketId,
  currentDeviceBrand,
  currentDeviceModel,
  categories,
  inventoryItems,
  globalSettings,
  onError,
}: EstimateCardProps) {
  const [isPending, startTransition] = useTransition();

  // 기기 정보
  const [deviceType, setDeviceType] = useState<string>(DeviceType.NOTEBOOK);
  const [deviceBrand, setDeviceBrand] = useState(currentDeviceBrand ?? "");
  const [deviceModel, setDeviceModel] = useState(currentDeviceModel ?? "");
  const [evaluatedValue, setEvaluatedValue] = useState<number | "">(0);
  const [autoFillHint, setAutoFillHint] = useState<string | null>(null);

  // 자동완성 debounce
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tryAutoFill = useCallback(
    (type: string, brand: string, model: string) => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
      if (!type || !brand.trim() || !model.trim()) {
        setAutoFillHint(null);
        return;
      }
      lookupTimer.current = setTimeout(async () => {
        const res = await lookupPastEvaluatedValue(type, brand.trim(), model.trim());
        if (res.data != null) {
          setEvaluatedValue(res.data);
          setAutoFillHint(`과거 동일 기기 가치: ${res.data.toLocaleString()}원 (자동 입력됨)`);
        } else {
          setAutoFillHint(null);
        }
      }, 500);
    },
    []
  );

  // 카테고리 체크박스
  const [checkedCategories, setCheckedCategories] = useState<Set<string>>(new Set());

  // 자재 선택 (categoryId → inventoryItemId)
  const [selectedItems, setSelectedItems] = useState<Map<string, SelectedMaterial>>(new Map());

  // 확정 견적
  const [confirmedEstimate, setConfirmedEstimate] = useState<number | "">(0);

  // ─── 카테고리 토글 ───

  function toggleCategory(catId: string) {
    setCheckedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
        // 해당 카테고리 자재 선택 해제
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

  // ─── 카테고리별 재고 목록 ───

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, InventoryItemRow[]>();
    for (const item of inventoryItems) {
      if (!map.has(item.category_id)) map.set(item.category_id, []);
      map.get(item.category_id)!.push(item);
    }
    return map;
  }, [inventoryItems]);

  // ─── 견적 계산 ───

  const materialTotal = useMemo(() => {
    let total = 0;
    for (const [, sel] of selectedItems) {
      const item = inventoryItems.find((i) => i.id === sel.inventoryItemId);
      if (item) total += item.base_estimate * sel.quantity;
    }
    return total;
  }, [selectedItems, inventoryItems]);

  const adjustedServiceCost = useMemo(() => {
    const ev = typeof evaluatedValue === "number" ? evaluatedValue : 0;
    const { base_service_cost, value_reference_amount, discount_surcharge_rate } = globalSettings;
    if (value_reference_amount <= 0) return base_service_cost;
    return Math.round(
      base_service_cost * (ev / value_reference_amount) * (discount_surcharge_rate / 100)
    );
  }, [evaluatedValue, globalSettings]);

  const minimumEstimate = materialTotal + adjustedServiceCost;

  // ─── 제출 ───

  function handleSubmit() {
    const ce = typeof confirmedEstimate === "number" ? confirmedEstimate : 0;
    if (ce < minimumEstimate) {
      alert("이 예상 견적으로는 진행할 수 없습니다.");
      return;
    }

    const materials = Array.from(selectedItems.values()).map((sel) => {
      const item = inventoryItems.find((i) => i.id === sel.inventoryItemId);
      return {
        inventory_item_id: sel.inventoryItemId,
        quantity: sel.quantity,
        request_type: item && item.quantity <= 0 ? "purchase" : "dispatch",
      };
    });

    const fd = new FormData();
    fd.set("ticketId", ticketId);
    fd.set("deviceType", deviceType);
    fd.set("deviceBrand", deviceBrand);
    fd.set("deviceModel", deviceModel);
    fd.set("evaluatedValue", String(typeof evaluatedValue === "number" ? evaluatedValue : 0));
    fd.set("minimumEstimate", String(minimumEstimate));
    fd.set("confirmedEstimate", String(ce));
    fd.set("materials", JSON.stringify(materials));

    startTransition(async () => {
      const result = await startRepairAction(fd);
      if (result?.error) onError(result.error);
    });
  }

  // ─── 아이템 라벨 생성 ───

  function itemLabel(item: InventoryItemRow) {
    const parts = [item.spec_name, item.product_name];
    if (item.capacity) parts.push(item.capacity);
    parts.push(`(${item.condition === "NEW" ? "신품" : "중고"})`);
    parts.push(`— ${item.base_estimate.toLocaleString()}원`);
    if (item.quantity <= 0) {
      parts.push(`[재고 0]`);
    } else {
      parts.push(`[재고: ${item.quantity}]`);
    }
    return parts.join(" ");
  }

  const DEVICE_TYPE_OPTIONS = [
    { value: DeviceType.NOTEBOOK, label: "노트북" },
    { value: DeviceType.DESKTOP, label: "데스크탑" },
    { value: DeviceType.SERVER, label: "서버" },
    { value: DeviceType.NAS, label: "나스" },
    { value: DeviceType.OTHER_STORAGE, label: "기타저장장치" },
  ];

  return (
    <section className="rounded-xl border-2 border-yellow-300 bg-yellow-50 p-5">
      <h2 className="mb-1 text-base font-semibold text-yellow-900">
        수리 시작 · 견적 산출
      </h2>
      <p className="mb-5 text-xs text-yellow-700">
        기기 정보와 필요 자재를 선택하면 실시간으로 견적이 계산됩니다.
      </p>

      {/* ─── 기기 정보 ─── */}
      <div className="mb-5 rounded-lg border border-yellow-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-800">기기 정보</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">기기 종류</label>
            <select
              value={deviceType}
              onChange={(e) => {
                setDeviceType(e.target.value);
                tryAutoFill(e.target.value, deviceBrand, deviceModel);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {DEVICE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">브랜드</label>
            <input
              type="text"
              value={deviceBrand}
              onChange={(e) => setDeviceBrand(e.target.value)}
              onBlur={() => tryAutoFill(deviceType, deviceBrand, deviceModel)}
              placeholder="예: LG, Samsung, HP"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">모델명</label>
            <input
              type="text"
              value={deviceModel}
              onChange={(e) => setDeviceModel(e.target.value)}
              onBlur={() => tryAutoFill(deviceType, deviceBrand, deviceModel)}
              placeholder="예: 그램 17"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">기기 가치 평가 (원)</label>
            <input
              type="number"
              min={0}
              value={evaluatedValue}
              onChange={(e) =>
                setEvaluatedValue(e.target.value === "" ? "" : Number(e.target.value))
              }
              placeholder="예: 1500000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm tabular-nums focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        {autoFillHint && (
          <p className="mt-2 text-xs text-blue-600">{autoFillHint}</p>
        )}
      </div>

      {/* ─── 주요 수리 부위 (카테고리 체크박스) ─── */}
      <div className="mb-5 rounded-lg border border-yellow-200 bg-white p-4">
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
        <div className="mb-5 rounded-lg border border-yellow-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-800">자재 선택</h3>
          <div className="space-y-3">
            {Array.from(checkedCategories).map((catId) => {
              const catName = categories.find((c) => c.id === catId)?.name ?? catId;
              const items = itemsByCategory.get(catId) ?? [];
              const selected = selectedItems.get(catId);
              return (
                <div key={catId} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    {catName}
                  </label>
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
                        {items
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {itemLabel(item)}
                            </option>
                          ))}
                      </select>
                      {selected && (
                        <input
                          type="number"
                          min={1}
                          max={
                            (() => {
                              const inv = inventoryItems.find((i) => i.id === selected.inventoryItemId);
                              return inv && inv.quantity > 0 ? inv.quantity : 99;
                            })()
                          }
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

      {/* ─── 실시간 견적 계산 결과 ─── */}
      <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-blue-900">견적 산출</h3>
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between rounded bg-white px-3 py-2">
            <dt className="text-gray-600">자재 기초 견적 합계</dt>
            <dd className="tabular-nums font-semibold text-gray-900">
              {materialTotal.toLocaleString()}원
            </dd>
          </div>
          <div className="flex justify-between rounded bg-white px-3 py-2">
            <dt className="text-gray-600">적용 서비스비용</dt>
            <dd className="tabular-nums font-semibold text-gray-900">
              {adjustedServiceCost.toLocaleString()}원
            </dd>
          </div>
          <div className="flex justify-between rounded bg-blue-100 px-3 py-2 sm:col-span-2">
            <dt className="font-semibold text-blue-800">최소 견적 금액</dt>
            <dd className="tabular-nums text-lg font-bold text-blue-900">
              {minimumEstimate.toLocaleString()}원
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-blue-600">
          서비스비용 = 기본서비스비용({globalSettings.base_service_cost.toLocaleString()}) ×
          (기기가치 ÷ 기준금액({globalSettings.value_reference_amount.toLocaleString()})) ×
          (할인할증률({globalSettings.discount_surcharge_rate}%) ÷ 100)
        </p>
      </div>

      {/* ─── 확정 예상 견적 ─── */}
      <div className="mb-4 rounded-lg border border-yellow-200 bg-white p-4">
        <label className="mb-1 block text-sm font-semibold text-gray-800">
          확정 예상 견적 (원)
        </label>
        <p className="mb-2 text-xs text-gray-500">
          고객과 통화 후 합의된 금액을 입력합니다. 최소 견적({minimumEstimate.toLocaleString()}원) 이상이어야 합니다.
        </p>
        <input
          type="number"
          min={0}
          value={confirmedEstimate}
          onChange={(e) =>
            setConfirmedEstimate(e.target.value === "" ? "" : Number(e.target.value))
          }
          placeholder={`최소 ${minimumEstimate.toLocaleString()}원`}
          className={`w-full rounded-lg border px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 ${
            typeof confirmedEstimate === "number" && confirmedEstimate > 0 && confirmedEstimate < minimumEstimate
              ? "border-red-400 focus:border-red-500 focus:ring-red-500/20"
              : "border-gray-300 focus:border-blue-500 focus:ring-blue-500/20"
          }`}
        />
        {typeof confirmedEstimate === "number" &&
          confirmedEstimate > 0 &&
          confirmedEstimate < minimumEstimate && (
            <p className="mt-1 text-xs text-red-500">
              최소 견적 금액({minimumEstimate.toLocaleString()}원)보다 낮습니다.
            </p>
          )}
      </div>

      {/* ─── 수리 진행 시작 버튼 ─── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            isPending ||
            !confirmedEstimate ||
            confirmedEstimate <= 0
          }
          className="rounded-lg bg-yellow-500 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-yellow-600 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:opacity-50"
        >
          {isPending ? "처리 중..." : "수리 진행 시작"}
        </button>
      </div>
    </section>
  );
}
