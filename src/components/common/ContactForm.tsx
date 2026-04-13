"use client";

import { useState } from "react";

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <section id="contact" className="bg-slate-50 py-16 sm:py-24">
        <div className="mx-auto max-w-xl px-4 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-900">접수가 완료되었습니다</h3>
          <p className="mt-2 text-slate-500">
            빠른 시일 내에 연락드리겠습니다. 감사합니다.
          </p>
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="mt-6 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            다시 접수하기
          </button>
        </div>
      </section>
    );
  }

  return (
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
          className="mx-auto mt-10 max-w-lg space-y-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-700">
                이름
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="홍길동"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
            <div>
              <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-slate-700">
                연락처
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                placeholder="010-1234-5678"
                className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          <div>
            <label htmlFor="device" className="mb-1.5 block text-sm font-medium text-slate-700">
              기종
            </label>
            <input
              id="device"
              name="device"
              type="text"
              required
              placeholder="예: 삼성 갤럭시북 프로, LG 그램 17인치"
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label htmlFor="symptoms" className="mb-1.5 block text-sm font-medium text-slate-700">
              증상
            </label>
            <textarea
              id="symptoms"
              name="symptoms"
              rows={4}
              required
              placeholder="고장 증상을 자세히 알려주세요.&#10;예: 전원이 켜지지 않음, 화면에 줄이 생김, 충전이 안됨 등"
              className="w-full resize-none rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
          >
            무료 견적 요청하기
          </button>

          <p className="text-center text-xs text-slate-400">
            접수 후 1시간 이내에 연락드립니다 (영업시간 기준)
          </p>
        </form>
      </div>
    </section>
  );
}
