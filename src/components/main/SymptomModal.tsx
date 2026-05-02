"use client";

import { useEffect } from "react";
import data from "@/data/mainPageData.json";

const theme = data.theme;
const symptoms = data.symptoms;

export type SymptomData = (typeof symptoms.items)[number];

export function SymptomModal({
  symptom,
  onClose,
}: {
  symptom: SymptomData | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!symptom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [symptom, onClose]);

  if (!symptom) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="symptom-modal-title"
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      style={{ fontFamily: theme.fontFamily }}
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="dr-fade-in absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />

      <div className="dr-modal-in relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div
          className="px-6 pt-6 pb-5 sm:px-8 sm:pt-8"
          style={{
            background: `linear-gradient(135deg, ${theme.accentSoft} 0%, #ffffff 100%)`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <span
                className="text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: theme.accentColor }}
              >
                {symptom.title}
              </span>
              <h3
                id="symptom-modal-title"
                className="mt-2 text-xl tracking-tight sm:text-2xl"
                style={{ color: theme.textPrimary, fontWeight: 800 }}
              >
                {symptom.modal.headline}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="-mr-2 -mt-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-6 sm:px-8 sm:py-8">
          <h4
            className="text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: theme.textSecondary }}
          >
            예상 고장 부위
          </h4>
          <ul className="mt-3 space-y-2">
            {symptom.modal.expectedParts.map((part) => (
              <li
                key={part}
                className="flex items-start gap-2.5 text-sm leading-relaxed sm:text-base"
                style={{ color: theme.textPrimary }}
              >
                <span
                  className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ background: theme.accentColor }}
                />
                <span>{part}</span>
              </li>
            ))}
          </ul>

          <h4
            className="mt-7 text-xs font-semibold uppercase tracking-[0.18em]"
            style={{ color: theme.textSecondary }}
          >
            수리 방법
          </h4>
          <p
            className="mt-3 text-sm leading-relaxed sm:text-base"
            style={{ color: theme.textPrimary }}
          >
            {symptom.modal.repairMethod}
          </p>
        </div>

        <div
          className="px-6 py-5 sm:px-8 sm:py-6"
          style={{ background: theme.surfaceMuted }}
        >
          <a
            href={symptoms.ctaHref}
            onClick={onClose}
            className="group flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold transition-all duration-200 hover:brightness-110"
            style={{
              background: theme.accentColor,
              color: "#ffffff",
              boxShadow: "0 14px 32px -12px rgba(37, 99, 235, 0.55)",
            }}
          >
            {symptoms.ctaLabel}
            <svg
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 5l7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>

    </div>
  );
}
