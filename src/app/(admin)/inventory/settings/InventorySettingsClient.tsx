"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  addCategory,
  updateCategory,
  deleteCategory,
  addSpec,
  updateSpec,
  deleteSpec,
  addProduct,
  updateProduct,
  deleteProduct,
  bulkAddCategories,
  bulkAddSpecs,
  bulkAddProducts,
  updateGlobalSettings,
} from "@/app/actions/inventoryActions";

// ─── 타입 ───

interface CategoryRow {
  id: string;
  name: string;
  created_at: string;
}

interface SpecRow {
  id: string;
  category_id: string;
  name: string;
  created_at: string;
  inventory_categories: { name: string } | null;
}

interface ProductRow {
  id: string;
  spec_id: string;
  name: string;
  created_at: string;
  inventory_specs: { name: string } | null;
}

interface GlobalSettingsData {
  base_service_cost: number;
  value_reference_amount: number;
  discount_surcharge_rate: number;
  updated_at: string;
}

interface Props {
  initialCategories: CategoryRow[];
  initialSpecs: SpecRow[];
  initialProducts: ProductRow[];
  initialGlobalSettings: GlobalSettingsData | null;
}

// ─── Bulk 입력 모달 컴포넌트 ───

function BulkAddModal({
  title,
  onClose,
  onSubmit,
  isPending,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (names: string[]) => void;
  isPending: boolean;
}) {
  const [inputs, setInputs] = useState<string[]>([""]);

  function addField() {
    setInputs((prev) => [...prev, ""]);
  }

  function removeField(index: number) {
    setInputs((prev) => prev.filter((_, i) => i !== index));
  }

  function updateField(index: number, value: string) {
    setInputs((prev) => prev.map((v, i) => (i === index ? value : v)));
  }

  function handlePaste(index: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text");
    // 콤마 또는 줄바꿈으로 여러 항목이 포함된 경우 자동 분리
    if (pasted.includes(",") || pasted.includes("\n")) {
      e.preventDefault();
      const items = pasted
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (items.length === 0) return;
      setInputs((prev) => {
        const updated = [...prev];
        updated[index] = items[0];
        // 나머지를 새 필드로 추가
        const rest = items.slice(1);
        return [...updated, ...rest];
      });
    }
  }

  function handleSubmit() {
    const names = inputs.map((s) => s.trim()).filter((s) => s.length > 0);
    if (names.length === 0) return;
    onSubmit(names);
  }

  const validCount = inputs.filter((s) => s.trim().length > 0).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mb-3 text-xs text-gray-500">
          콤마(,) 또는 줄바꿈으로 구분하여 붙여넣기하면 자동으로 분리됩니다.
        </p>

        <div className="max-h-64 space-y-2 overflow-y-auto">
          {inputs.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={value}
                onChange={(e) => updateField(index, e.target.value)}
                onPaste={(e) => handlePaste(index, e)}
                placeholder={`항목 ${index + 1}`}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                autoFocus={index === inputs.length - 1}
              />
              {inputs.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeField(index)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addField}
          className="mt-2 w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500"
        >
          + 입력 필드 추가
        </button>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {validCount}개 항목
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              취소
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending || validCount === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending ? "처리 중..." : `${validCount}개 추가`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ───

export default function InventorySettingsClient({
  initialCategories,
  initialSpecs,
  initialProducts,
  initialGlobalSettings,
}: Props) {
  const [isPending, startTransition] = useTransition();

  // 데이터 상태
  const [categories, setCategories] = useState(initialCategories);
  const [specs, setSpecs] = useState(initialSpecs);
  const [products, setProducts] = useState(initialProducts);

  // 글로벌 설정 상태
  const [baseCost, setBaseCost] = useState(
    initialGlobalSettings?.base_service_cost ?? 0
  );
  const [refAmount, setRefAmount] = useState(
    initialGlobalSettings?.value_reference_amount ?? 0
  );
  const [discountRate, setDiscountRate] = useState(
    initialGlobalSettings?.discount_surcharge_rate ?? 100
  );

  // 선택 상태
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSpecId, setSelectedSpecId] = useState<string | null>(null);

  // 모달 상태
  const [bulkModal, setBulkModal] = useState<"category" | "spec" | "product" | null>(null);

  // 알림
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  }

  // 파생 데이터
  const filteredSpecs = selectedCategoryId
    ? specs.filter((s) => s.category_id === selectedCategoryId)
    : [];

  const filteredProducts = selectedSpecId
    ? products.filter((p) => p.spec_id === selectedSpecId)
    : [];

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const selectedSpec = specs.find((s) => s.id === selectedSpecId);

  // ─── 글로벌 설정 핸들러 ───

  function handleSaveGlobalSettings() {
    startTransition(async () => {
      const res = await updateGlobalSettings({
        base_service_cost: baseCost,
        value_reference_amount: refAmount,
        discount_surcharge_rate: discountRate,
      });
      if (res.error) return showToast("error", res.error);
      showToast("success", "기본 서비스 비용 설정이 저장되었습니다.");
    });
  }

  // ─── 카테고리 핸들러 ───

  function handleAddCategory() {
    setBulkModal("category");
  }

  function handleBulkAddCategories(names: string[]) {
    startTransition(async () => {
      if (names.length === 1) {
        const res = await addCategory(names[0]);
        if (res.error) return showToast("error", res.error);
        const newId = "id" in res ? (res.id as string) : crypto.randomUUID();
        setCategories((prev) => [
          ...prev,
          { id: newId, name: names[0].trim(), created_at: new Date().toISOString() },
        ]);
      } else {
        const res = await bulkAddCategories(names);
        if (res.error) return showToast("error", res.error);
        if ("data" in res && res.data) {
          setCategories((prev) => [
            ...prev,
            ...res.data.map((d: { id: string; name: string }) => ({
              id: d.id,
              name: d.name,
              created_at: new Date().toISOString(),
            })),
          ]);
        }
      }
      showToast("success", `카테고리 ${names.length}개가 추가되었습니다.`);
      setBulkModal(null);
    });
  }

  function handleEditCategory(cat: CategoryRow) {
    const newName = prompt("카테고리명 수정:", cat.name);
    if (!newName?.trim() || newName.trim() === cat.name) return;
    startTransition(async () => {
      const res = await updateCategory(cat.id, newName);
      if (res.error) return showToast("error", res.error);
      showToast("success", "카테고리가 수정되었습니다.");
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, name: newName.trim() } : c))
      );
    });
  }

  function handleDeleteCategory(cat: CategoryRow) {
    if (!confirm(`'${cat.name}' 카테고리를 삭제하시겠습니까?\n하위 사양 및 제품도 모두 삭제됩니다.`))
      return;
    startTransition(async () => {
      const res = await deleteCategory(cat.id);
      if (res.error) return showToast("error", res.error);
      showToast("success", "카테고리가 삭제되었습니다.");
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      const specIds = specs.filter((s) => s.category_id === cat.id).map((s) => s.id);
      setSpecs((prev) => prev.filter((s) => s.category_id !== cat.id));
      setProducts((prev) => prev.filter((p) => !specIds.includes(p.spec_id)));
      if (selectedCategoryId === cat.id) {
        setSelectedCategoryId(null);
        setSelectedSpecId(null);
      }
    });
  }

  // ─── 사양 핸들러 ───

  function handleAddSpec() {
    if (!selectedCategoryId) return;
    setBulkModal("spec");
  }

  function handleBulkAddSpecs(names: string[]) {
    if (!selectedCategoryId) return;
    startTransition(async () => {
      if (names.length === 1) {
        const res = await addSpec(selectedCategoryId, names[0]);
        if (res.error) return showToast("error", res.error);
        const newId = "id" in res ? (res.id as string) : crypto.randomUUID();
        setSpecs((prev) => [
          ...prev,
          {
            id: newId,
            category_id: selectedCategoryId,
            name: names[0].trim(),
            created_at: new Date().toISOString(),
            inventory_categories: selectedCategory ? { name: selectedCategory.name } : null,
          },
        ]);
      } else {
        const res = await bulkAddSpecs(selectedCategoryId, names);
        if (res.error) return showToast("error", res.error);
        if ("data" in res && res.data) {
          setSpecs((prev) => [
            ...prev,
            ...res.data.map((d: { id: string; category_id: string; name: string }) => ({
              id: d.id,
              category_id: d.category_id,
              name: d.name,
              created_at: new Date().toISOString(),
              inventory_categories: selectedCategory ? { name: selectedCategory.name } : null,
            })),
          ]);
        }
      }
      showToast("success", `사양 ${names.length}개가 추가되었습니다.`);
      setBulkModal(null);
    });
  }

  function handleEditSpec(spec: SpecRow) {
    const newName = prompt("사양명 수정:", spec.name);
    if (!newName?.trim() || newName.trim() === spec.name) return;
    startTransition(async () => {
      const res = await updateSpec(spec.id, newName);
      if (res.error) return showToast("error", res.error);
      showToast("success", "사양이 수정되었습니다.");
      setSpecs((prev) =>
        prev.map((s) => (s.id === spec.id ? { ...s, name: newName.trim() } : s))
      );
    });
  }

  function handleDeleteSpec(spec: SpecRow) {
    if (!confirm(`'${spec.name}' 사양을 삭제하시겠습니까?\n하위 제품도 모두 삭제됩니다.`)) return;
    startTransition(async () => {
      const res = await deleteSpec(spec.id);
      if (res.error) return showToast("error", res.error);
      showToast("success", "사양이 삭제되었습니다.");
      setSpecs((prev) => prev.filter((s) => s.id !== spec.id));
      setProducts((prev) => prev.filter((p) => p.spec_id !== spec.id));
      if (selectedSpecId === spec.id) setSelectedSpecId(null);
    });
  }

  // ─── 제품 핸들러 ───

  function handleAddProduct() {
    if (!selectedSpecId) return;
    setBulkModal("product");
  }

  function handleBulkAddProducts(names: string[]) {
    if (!selectedSpecId) return;
    startTransition(async () => {
      if (names.length === 1) {
        const res = await addProduct(selectedSpecId, names[0]);
        if (res.error) return showToast("error", res.error);
        const newId = "id" in res ? (res.id as string) : crypto.randomUUID();
        setProducts((prev) => [
          ...prev,
          {
            id: newId,
            spec_id: selectedSpecId,
            name: names[0].trim(),
            created_at: new Date().toISOString(),
            inventory_specs: selectedSpec ? { name: selectedSpec.name } : null,
          },
        ]);
      } else {
        const res = await bulkAddProducts(selectedSpecId, names);
        if (res.error) return showToast("error", res.error);
        if ("data" in res && res.data) {
          setProducts((prev) => [
            ...prev,
            ...res.data.map((d: { id: string; spec_id: string; name: string }) => ({
              id: d.id,
              spec_id: d.spec_id,
              name: d.name,
              created_at: new Date().toISOString(),
              inventory_specs: selectedSpec ? { name: selectedSpec.name } : null,
            })),
          ]);
        }
      }
      showToast("success", `제품 ${names.length}개가 추가되었습니다.`);
      setBulkModal(null);
    });
  }

  function handleEditProduct(product: ProductRow) {
    const newName = prompt("제품명 수정:", product.name);
    if (!newName?.trim() || newName.trim() === product.name) return;
    startTransition(async () => {
      const res = await updateProduct(product.id, newName);
      if (res.error) return showToast("error", res.error);
      showToast("success", "제품명이 수정되었습니다.");
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, name: newName.trim() } : p))
      );
    });
  }

  function handleDeleteProduct(product: ProductRow) {
    if (!confirm(`'${product.name}' 제품을 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const res = await deleteProduct(product.id);
      if (res.error) return showToast("error", res.error);
      showToast("success", "제품이 삭제되었습니다.");
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    });
  }

  // ─── 렌더링 ───

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">재고 분류 설정</h1>
          <p className="mt-1 text-sm text-gray-500">
            카테고리 → 사양 → 제품 순서로 분류 옵션을 관리합니다.
          </p>
        </div>
        <Link
          href="/inventory"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          ← 재고 관리
        </Link>
      </div>

      {/* 기본 서비스 비용 설정 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">기본 서비스 비용 설정</h2>
        <p className="mb-4 text-xs text-gray-500">견적 산출에 사용되는 기본값을 설정합니다.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              기본 서비스 비용 (원)
            </label>
            <input
              type="number"
              min={0}
              value={baseCost}
              onChange={(e) => setBaseCost(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              가치 기준 금액 (원)
            </label>
            <input
              type="number"
              min={0}
              value={refAmount}
              onChange={(e) => setRefAmount(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              할인/할증률 (%)
            </label>
            <input
              type="number"
              min={0}
              max={200}
              value={discountRate}
              onChange={(e) => setDiscountRate(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end">
          <button
            onClick={handleSaveGlobalSettings}
            disabled={isPending}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "저장 중..." : "설정 저장"}
          </button>
        </div>
      </div>

      {/* 3단 컬럼 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 1열: 카테고리 */}
        <ColumnPanel
          title="카테고리"
          count={categories.length}
          onAdd={handleAddCategory}
          isPending={isPending}
        >
          {categories.length === 0 ? (
            <EmptyState text="카테고리를 추가해 주세요." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {categories.map((cat) => (
                <ListItem
                  key={cat.id}
                  name={cat.name}
                  isSelected={cat.id === selectedCategoryId}
                  onSelect={() => {
                    setSelectedCategoryId(cat.id === selectedCategoryId ? null : cat.id);
                    setSelectedSpecId(null);
                  }}
                  onEdit={() => handleEditCategory(cat)}
                  onDelete={() => handleDeleteCategory(cat)}
                  isPending={isPending}
                />
              ))}
            </ul>
          )}
        </ColumnPanel>

        {/* 2열: 사양 */}
        <ColumnPanel
          title={selectedCategory ? `사양 — ${selectedCategory.name}` : "사양"}
          count={filteredSpecs.length}
          onAdd={selectedCategoryId ? handleAddSpec : undefined}
          isPending={isPending}
          disabled={!selectedCategoryId}
        >
          {!selectedCategoryId ? (
            <EmptyState text="좌측에서 카테고리를 선택하세요." />
          ) : filteredSpecs.length === 0 ? (
            <EmptyState text="사양을 추가해 주세요." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredSpecs.map((spec) => (
                <ListItem
                  key={spec.id}
                  name={spec.name}
                  isSelected={spec.id === selectedSpecId}
                  onSelect={() =>
                    setSelectedSpecId(spec.id === selectedSpecId ? null : spec.id)
                  }
                  onEdit={() => handleEditSpec(spec)}
                  onDelete={() => handleDeleteSpec(spec)}
                  isPending={isPending}
                />
              ))}
            </ul>
          )}
        </ColumnPanel>

        {/* 3열: 제품 */}
        <ColumnPanel
          title={selectedSpec ? `제품 — ${selectedSpec.name}` : "제품"}
          count={filteredProducts.length}
          onAdd={selectedSpecId ? handleAddProduct : undefined}
          isPending={isPending}
          disabled={!selectedSpecId}
        >
          {!selectedSpecId ? (
            <EmptyState text="좌측에서 사양을 선택하세요." />
          ) : filteredProducts.length === 0 ? (
            <EmptyState text="제품을 추가해 주세요." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {filteredProducts.map((prod) => (
                <ListItem
                  key={prod.id}
                  name={prod.name}
                  isSelected={false}
                  onSelect={() => {}}
                  onEdit={() => handleEditProduct(prod)}
                  onDelete={() => handleDeleteProduct(prod)}
                  isPending={isPending}
                />
              ))}
            </ul>
          )}
        </ColumnPanel>
      </div>

      {/* Bulk 입력 모달 */}
      {bulkModal === "category" && (
        <BulkAddModal
          title="카테고리 추가"
          onClose={() => setBulkModal(null)}
          onSubmit={handleBulkAddCategories}
          isPending={isPending}
        />
      )}
      {bulkModal === "spec" && selectedCategoryId && (
        <BulkAddModal
          title={`사양 추가 — ${selectedCategory?.name ?? ""}`}
          onClose={() => setBulkModal(null)}
          onSubmit={handleBulkAddSpecs}
          isPending={isPending}
        />
      )}
      {bulkModal === "product" && selectedSpecId && (
        <BulkAddModal
          title={`제품 추가 — ${selectedSpec?.name ?? ""}`}
          onClose={() => setBulkModal(null)}
          onSubmit={handleBulkAddProducts}
          isPending={isPending}
        />
      )}

      {/* 토스트 */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 animate-slide-in rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* 로딩 오버레이 */}
      {isPending && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/10">
          <div className="rounded-lg bg-white px-6 py-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
              <span className="text-sm text-gray-700">처리 중...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 하위 컴포넌트 ───

function ColumnPanel({
  title,
  count,
  onAdd,
  isPending,
  disabled,
  children,
}: {
  title: string;
  count: number;
  onAdd?: () => void;
  isPending: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border bg-white shadow-sm transition-opacity ${
        disabled ? "opacity-60" : ""
      }`}
    >
      {/* 패널 헤더 */}
      <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
            {count}
          </span>
        </div>
        {onAdd && (
          <button
            onClick={onAdd}
            disabled={isPending}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            + 추가
          </button>
        )}
      </div>
      {/* 패널 본문 */}
      <div className="max-h-[480px] flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function ListItem({
  name,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  isPending,
}: {
  name: string;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isPending: boolean;
}) {
  return (
    <li
      className={`group flex items-center justify-between px-4 py-2.5 transition-colors ${
        isSelected ? "bg-blue-50" : "hover:bg-gray-50"
      }`}
    >
      <button
        onClick={onSelect}
        className={`flex-1 text-left text-sm ${
          isSelected ? "font-semibold text-blue-700" : "text-gray-700"
        }`}
      >
        {name}
      </button>
      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          disabled={isPending}
          className="rounded px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50"
        >
          수정
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          disabled={isPending}
          className="rounded px-2 py-1 text-xs text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
        >
          삭제
        </button>
      </div>
    </li>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center">
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}
