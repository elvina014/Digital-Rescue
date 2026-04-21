"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addInventoryItem } from "@/app/actions/inventoryActions";
import { ItemCondition } from "@/types";

// ─── Zod 스키마 ───

const inventorySchema = z.object({
  category_id: z.string().min(1, "카테고리를 선택해 주세요."),
  spec_id: z.string().min(1, "사양을 선택해 주세요."),
  product_id: z.string().min(1, "제품을 선택해 주세요."),
  capacity: z.string().optional(),
  condition: z.enum(["NEW", "USED"], { message: "상태를 선택해 주세요." }),
  quantity: z.number().int().min(0, "수량은 0 이상이어야 합니다."),
  base_estimate: z.number().int().min(0, "기초견적은 0 이상이어야 합니다."),
});

type InventoryFormValues = z.infer<typeof inventorySchema>;

// ─── 타입 ───

interface CategoryRow {
  id: string;
  name: string;
}
interface SpecRow {
  id: string;
  category_id: string;
  name: string;
}
interface ProductRow {
  id: string;
  spec_id: string;
  name: string;
}

interface Props {
  categories: CategoryRow[];
  specs: SpecRow[];
  products: ProductRow[];
}

// ─── 메인 컴포넌트 ───

export default function NewInventoryForm({ categories, specs, products }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<InventoryFormValues>({
    resolver: zodResolver(inventorySchema),
    defaultValues: {
      category_id: "",
      spec_id: "",
      product_id: "",
      capacity: "",
      condition: "USED",
      quantity: 0,
      base_estimate: 0,
    },
  });

  const selectedCategoryId = watch("category_id");
  const selectedSpecId = watch("spec_id");

  const filteredSpecs = selectedCategoryId
    ? specs.filter((s) => s.category_id === selectedCategoryId)
    : [];

  const filteredProducts = selectedSpecId
    ? products.filter((p) => p.spec_id === selectedSpecId)
    : [];

  function onCategoryChange(categoryId: string) {
    setValue("category_id", categoryId);
    setValue("spec_id", "");
    setValue("product_id", "");
  }

  function onSpecChange(specId: string) {
    setValue("spec_id", specId);
    setValue("product_id", "");
  }

  function onSubmit(data: InventoryFormValues) {
    setServerError(null);
    startTransition(async () => {
      const res = await addInventoryItem({
        category_id: data.category_id,
        spec_id: data.spec_id,
        product_id: data.product_id,
        capacity: data.capacity || undefined,
        condition: data.condition as ItemCondition,
        quantity: data.quantity,
        base_estimate: data.base_estimate,
      });

      if (res.error) {
        setServerError(res.error);
        return;
      }

      router.push("/inventory");
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      {serverError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      {/* ① 카테고리 */}
      <FieldWrapper label="카테고리" required error={errors.category_id?.message}>
        <select
          {...register("category_id")}
          onChange={(e) => onCategoryChange(e.target.value)}
          className={selectClass(errors.category_id)}
        >
          <option value="">선택하세요</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FieldWrapper>

      {/* ② 사양 */}
      <FieldWrapper label="사양" required error={errors.spec_id?.message}>
        <select
          {...register("spec_id")}
          onChange={(e) => onSpecChange(e.target.value)}
          disabled={!selectedCategoryId}
          className={selectClass(errors.spec_id, !selectedCategoryId)}
        >
          <option value="">
            {selectedCategoryId ? "선택하세요" : "카테고리를 먼저 선택하세요"}
          </option>
          {filteredSpecs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </FieldWrapper>

      {/* ③ 제품명 */}
      <FieldWrapper label="제품명" required error={errors.product_id?.message}>
        <select
          {...register("product_id")}
          disabled={!selectedSpecId}
          className={selectClass(errors.product_id, !selectedSpecId)}
        >
          <option value="">
            {selectedSpecId ? "선택하세요" : "사양을 먼저 선택하세요"}
          </option>
          {filteredProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FieldWrapper>

      {/* ④ 용량 */}
      <FieldWrapper label="용량 / 인치수" error={errors.capacity?.message}>
        <input
          {...register("capacity")}
          type="text"
          placeholder="예: 8GB, 256GB, 15.6인치"
          className={inputClass(errors.capacity)}
        />
      </FieldWrapper>

      {/* ⑤ 상태 */}
      <FieldWrapper label="상태" required error={errors.condition?.message}>
        <select {...register("condition")} className={selectClass(errors.condition)}>
          <option value="NEW">신품</option>
          <option value="USED">중고품</option>
        </select>
      </FieldWrapper>

      {/* ⑥ 수량 */}
      <FieldWrapper label="수량" required error={errors.quantity?.message}>
        <input
          {...register("quantity", { valueAsNumber: true })}
          type="number"
          min={0}
          placeholder="0"
          className={inputClass(errors.quantity)}
        />
      </FieldWrapper>

      {/* ⑦ 기초견적 */}
      <FieldWrapper label="기초견적 (원)" required error={errors.base_estimate?.message}>
        <input
          {...register("base_estimate", { valueAsNumber: true })}
          type="number"
          min={0}
          step={1000}
          placeholder="0"
          className={inputClass(errors.base_estimate)}
        />
      </FieldWrapper>

      {/* 제출 */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "등록 중..." : "재고 등록"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/inventory")}
          disabled={isPending}
          className="rounded-lg border border-gray-300 px-6 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </form>
  );
}

// ─── 헬퍼 컴포넌트 / 유틸 ───

function FieldWrapper({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function inputClass(error?: { message?: string }) {
  return `w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 ${
    error
      ? "border-red-300 focus:border-red-500 focus:ring-red-200"
      : "border-gray-300 focus:border-blue-500 focus:ring-blue-200"
  }`;
}

function selectClass(error?: { message?: string }, disabled?: boolean) {
  return `w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2 ${
    error
      ? "border-red-300 focus:border-red-500 focus:ring-red-200"
      : "border-gray-300 focus:border-blue-500 focus:ring-blue-200"
  } ${disabled ? "cursor-not-allowed bg-gray-100 text-gray-400" : "bg-white"}`;
}
