"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  submitTicketAction,
  type TicketFormState,
} from "@/app/actions/ticketActions";

const RECEIPT_TYPES = [
  { value: "WALK_IN", label: "내방 (센터 방문)" },
  { value: "VISIT", label: "방문 수거 요청" },
  { value: "QUICK", label: "퀵 서비스" },
  { value: "PARCEL", label: "택배 서비스" },
] as const;

const BRANDS = [
  "삼성",
  "LG",
  "ASUS",
  "MSI",
  "레노버",
  "HP",
  "델",
  "에이서",
  "애플",
  "기타",
] as const;

const initialState: TicketFormState = {
  success: false,
  message: "",
};

export function ContactForm() {
  const [state, formAction, isPending] = useActionState(
    submitTicketAction,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [showToast, setShowToast] = useState(false);
  // state가 바뀔 때마다 formKey를 갱신하여 폼을 재마운트 → defaultValue 반영
  const [formKey, setFormKey] = useState(0);

  // state가 바뀔 때마다 formKey를 갱신하여 폼을 재마운트 → defaultValue 반영
  useEffect(() => {
    setFormKey((k) => k + 1);

    if (state.success) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [state]);

  return (
    <>
      {/* ── 성공 토스트 알림 ── */}
      {showToast && (
        <div className="fixed right-4 top-4 z-50 animate-slide-in">
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-white px-5 py-4 shadow-xl shadow-green-100/50">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-5 w-5 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                접수 완료!
              </p>
              <p className="mt-0.5 text-sm text-slate-500">
                {state.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowToast(false)}
              className="ml-4 text-slate-400 hover:text-slate-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <section id="contact" className="bg-slate-50 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-xl text-center">
            <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              무료 견적 받기
            </h2>
            <p className="mt-3 text-slate-500">
              증상을 알려주시면 빠르게 예상 비용을 안내드립니다
            </p>
          </div>

          {/* ── 서버 에러 메시지 ── */}
          {!state.success && state.message && (
            <div className="mx-auto mt-6 max-w-lg rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {state.message}
            </div>
          )}

          <form
            key={formKey}
            ref={formRef}
            action={formAction}
            className="mx-auto mt-10 max-w-lg space-y-5"
          >
            {/* 이름 · 연락처 */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  이름 <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  defaultValue={state.values?.name}
                  placeholder="홍길동"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                {state.errors?.name && (
                  <p className="mt-1 text-xs text-red-500">
                    {state.errors.name}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="phone"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  연락처 <span className="text-red-500">*</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  defaultValue={state.values?.phone}
                  placeholder="010-1234-5678"
                  className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                {state.errors?.phone && (
                  <p className="mt-1 text-xs text-red-500">
                    {state.errors.phone}
                  </p>
                )}
              </div>
            </div>

            {/* 주소 */}
            <div>
              <label
                htmlFor="address"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                주소{" "}
                <span className="text-xs text-slate-400">
                  (방문/퀵/택배 시 필요)
                </span>
              </label>
              <input
                id="address"
                name="address"
                type="text"
                defaultValue={state.values?.address}
                placeholder="서울시 강남구 ..."
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            {/* 접수 방식 · 브랜드 */}
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="receiptType"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  접수 방식 <span className="text-red-500">*</span>
                </label>
                <select
                  id="receiptType"
                  name="receiptType"
                  required
                  defaultValue={state.values?.receiptType ?? ""}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="" disabled>
                    선택
                  </option>
                  {RECEIPT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {state.errors?.receiptType && (
                  <p className="mt-1 text-xs text-red-500">
                    {state.errors.receiptType}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="deviceBrand"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  브랜드 <span className="text-red-500">*</span>
                </label>
                <select
                  id="deviceBrand"
                  name="deviceBrand"
                  required
                  defaultValue={state.values?.deviceBrand ?? ""}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="" disabled>
                    선택
                  </option>
                  {BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
                {state.errors?.deviceBrand && (
                  <p className="mt-1 text-xs text-red-500">
                    {state.errors.deviceBrand}
                  </p>
                )}
              </div>
            </div>

            {/* 기종 */}
            <div>
              <label
                htmlFor="deviceModel"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                모델명{" "}
                <span className="text-xs text-slate-400">(선택사항)</span>
              </label>
              <input
                id="deviceModel"
                name="deviceModel"
                type="text"
                defaultValue={state.values?.deviceModel}
                placeholder="예: 갤럭시북 프로 360, 그램 17Z90R"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            {/* 증상 */}
            <div>
              <label
                htmlFor="symptoms"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                고장 증상 <span className="text-red-500">*</span>
              </label>
              <textarea
                id="symptoms"
                name="symptoms"
                rows={4}
                required
                defaultValue={state.values?.symptoms}
                placeholder={
                  "고장 증상을 자세히 알려주세요.\n예: 전원이 켜지지 않음, 화면에 줄이 생김, 충전이 안됨 등"
                }
                className="w-full resize-none rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              {state.errors?.symptoms && (
                <p className="mt-1 text-xs text-red-500">
                  {state.errors.symptoms}
                </p>
              )}
            </div>

            {/* 제출 버튼 */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-blue-400"
            >
              {isPending ? (
                <span className="inline-flex items-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  접수 중...
                </span>
              ) : (
                "무료 견적 요청하기"
              )}
            </button>

            <p className="text-center text-xs text-slate-400">
              접수 후 1시간 이내에 연락드립니다 (영업시간 기준)
            </p>
          </form>
        </div>
      </section>
    </>
  );
}
