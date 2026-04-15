"use client";

import { useState } from "react";
import { createTicketAction } from "../actions";

const RECEIPT_TYPE_OPTIONS = [
  { value: "WALK_IN", label: "내방" },
  { value: "VISIT", label: "방문" },
  { value: "QUICK", label: "퀵" },
  { value: "PARCEL", label: "택배" },
] as const;

const BRAND_OPTIONS = [
  "Samsung", "LG", "MSI", "ASUS", "Lenovo", "HP", "Dell", "Acer", "Apple", "기타",
] as const;

export default function NewTicketForm() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);
    const result = await createTicketAction(formData);
    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 고객 정보 섹션 */}
      <fieldset className="rounded-xl border border-gray-200 bg-white p-5">
        <legend className="px-2 text-sm font-semibold text-gray-700">고객 정보</legend>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="customerName" className="mb-1 block text-sm font-medium text-gray-700">
              고객명 <span className="text-red-500">*</span>
            </label>
            <input
              id="customerName"
              name="customerName"
              type="text"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label htmlFor="customerPhone" className="mb-1 block text-sm font-medium text-gray-700">
              연락처 <span className="text-red-500">*</span>
            </label>
            <input
              id="customerPhone"
              name="customerPhone"
              type="tel"
              required
              placeholder="010-0000-0000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="customerAddress" className="mb-1 block text-sm font-medium text-gray-700">
              주소 <span className="text-xs text-gray-400">(방문/택배 시 필요)</span>
            </label>
            <input
              id="customerAddress"
              name="customerAddress"
              type="text"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
      </fieldset>

      {/* 접수 정보 섹션 */}
      <fieldset className="rounded-xl border border-gray-200 bg-white p-5">
        <legend className="px-2 text-sm font-semibold text-gray-700">접수 정보</legend>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="receiptType" className="mb-1 block text-sm font-medium text-gray-700">
              접수 방식 <span className="text-red-500">*</span>
            </label>
            <select
              id="receiptType"
              name="receiptType"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">선택</option>
              {RECEIPT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="deviceBrand" className="mb-1 block text-sm font-medium text-gray-700">
              기기 브랜드 <span className="text-red-500">*</span>
            </label>
            <select
              id="deviceBrand"
              name="deviceBrand"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">선택</option>
              {BRAND_OPTIONS.map((brand) => (
                <option key={brand} value={brand.toLowerCase()}>
                  {brand}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="deviceModel" className="mb-1 block text-sm font-medium text-gray-700">
              모델명 <span className="text-xs text-gray-400">(선택)</span>
            </label>
            <input
              id="deviceModel"
              name="deviceModel"
              type="text"
              placeholder="예: GF63 Thin 10SCXR"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="symptoms" className="mb-1 block text-sm font-medium text-gray-700">
              고장 증상 / 문의 내용 <span className="text-red-500">*</span>
            </label>
            <textarea
              id="symptoms"
              name="symptoms"
              required
              rows={4}
              placeholder="고객이 설명한 증상을 상세히 기록해 주세요."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end gap-3">
        <a
          href="/tickets"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          취소
        </a>
        <button
          type="submit"
          disabled={isLoading}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "접수 중..." : "접수 등록"}
        </button>
      </div>
    </form>
  );
}
