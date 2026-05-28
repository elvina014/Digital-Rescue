"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTicketAction } from "../actions";
import { addTicketImagesAction } from "../actions";
import ImageUploader from "@/components/common/ImageUploader";
import { compressAndUploadSingle } from "@/lib/imageUpload";
import type { TicketImage } from "@/lib/imageUpload";
import { EmployeeRole } from "@/types";

const RECEIPT_TYPE_OPTIONS = [
  { value: "WALK_IN", label: "내방" },
  { value: "VISIT", label: "방문" },
  { value: "QUICK", label: "퀵" },
  { value: "PARCEL", label: "택배" },
] as const;

const DEVICE_TYPE_OPTIONS = [
  { value: "노트북",       label: "노트북" },
  { value: "데스크탑",     label: "데스크탑" },
  { value: "태블릿",       label: "태블릿" },
  { value: "서버",         label: "서버" },
  { value: "나스",         label: "나스" },
  { value: "기타저장장치", label: "기타저장장치" },
] as const;

const BRAND_OPTIONS = [
  "Samsung", "LG", "한성", "MSI", "ASUS", "Lenovo", "HP", "Dell", "Acer", "Apple", "기타",
] as const;

export default function NewTicketForm({ currentEmployee }: { currentEmployee: { id: string; name: string; role: EmployeeRole } }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingImages, setPendingImages] = useState<{ file: File; description: string; previewUrl: string }[]>([]);

  // 테스트 접수 체크박스는 ADMIN/MANAGER만 노출 (RECEPTION 제외)
  const canMarkAsTest =
    currentEmployee.role === EmployeeRole.ADMIN ||
    currentEmployee.role === EmployeeRole.MANAGER;

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    setError(null);
    try {
      const result = await createTicketAction(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }

      // 이미지 업로드 (접수건 생성 성공 후, 1장씩)
      if (result?.ticketId && pendingImages.length > 0) {
        const allUploaded: TicketImage[] = [];
        const uploadErrors: string[] = [];
        for (let i = 0; i < pendingImages.length; i++) {
          const { file, description } = pendingImages[i];
          const { uploaded, error: uploadError } = await compressAndUploadSingle(result.ticketId, file, i, {
            description,
            uploaded_by: currentEmployee.id,
            uploader_name: currentEmployee.name,
            is_customer: false,
          });
          if (uploaded) allUploaded.push(uploaded);
          else if (uploadError) uploadErrors.push(`${file.name}: ${uploadError}`);
        }
        if (allUploaded.length > 0) {
          await addTicketImagesAction(result.ticketId, allUploaded);
        }
        if (uploadErrors.length > 0) {
          setError(`접수는 등록되었지만 일부 이미지 업로드에 실패했습니다:\n${uploadErrors.join("\n")}`);
          return;
        }
      }

      pendingImages.forEach((entry) => URL.revokeObjectURL(entry.previewUrl));
      router.push("/tickets");
    } catch (err) {
      console.error("Ticket submit failed:", err);
      setError("서버 통신 중 오류가 발생했습니다.");
    } finally {
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
        <div className="mt-2 grid gap-4 sm:grid-cols-3">
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
            <label htmlFor="deviceType" className="mb-1 block text-sm font-medium text-gray-700">
              기기 종류 <span className="text-red-500">*</span>
            </label>
            <select
              id="deviceType"
              name="deviceType"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">선택</option>
              {DEVICE_TYPE_OPTIONS.map((opt) => (
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
          <div className="sm:col-span-3">
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

          <div className="sm:col-span-3">
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

          {canMarkAsTest && (
            <div className="sm:col-span-3">
              <label className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-900">
                <input
                  type="checkbox"
                  name="isTest"
                  value="true"
                  className="h-4 w-4 rounded border-yellow-400 text-yellow-600 focus:ring-yellow-500"
                />
                <span className="font-medium">테스트 접수입니다 (통계·일반 화면에서 제외)</span>
              </label>
            </div>
          )}
        </div>
      </fieldset>

      {/* 이미지 첨부 */}
      <fieldset className="rounded-xl border border-gray-200 bg-white p-5">
        <legend className="px-2 text-sm font-semibold text-gray-700">기기 사진</legend>
        <div className="mt-2">
          {/* 등록 대기 이미지 목록 */}
          {pendingImages.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {pendingImages.map((entry, i) => (
                <div key={i} className="group relative">
                  <img
                    src={entry.previewUrl}
                    alt={entry.description || `이미지 ${i + 1}`}
                    className="h-24 w-full rounded-lg border border-gray-200 object-cover"
                  />
                  {entry.description && (
                    <p className="mt-0.5 truncate text-[10px] text-gray-500">{entry.description}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(entry.previewUrl);
                      setPendingImages((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {pendingImages.length < 12 && (
            <ImageUploader
              onUpload={async (file, description) => {
                const previewUrl = URL.createObjectURL(file);
                setPendingImages((prev) => [...prev, { file, description, previewUrl }]);
              }}
              disabled={pendingImages.length >= 12}
              label={`접수 시 기기 사진을 첨부하세요 (${pendingImages.length}/12)`}
            />
          )}
          <p className="mt-2 text-xs text-gray-400">
            * 이미지는 접수 등록 후 상세 페이지에서도 추가할 수 있습니다.
          </p>
        </div>
      </fieldset>

      <div className="flex justify-end gap-3">
        <Link
          href="/tickets"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          취소
        </Link>
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
