"use client";

import { useEffect, useState } from "react";
import data from "@/data/mainPageData.json";
import { ServiceIcon, type IconName } from "./icons";

const dr = data.digitalResources;
const theme = data.theme;

type NewsItem = (typeof dr.news.items)[number];
type TabKey = "news" | "emergency" | "brands";

export function DigitalResourcesSection() {
  const [tab, setTab] = useState<TabKey>("news");
  const [activeNews, setActiveNews] = useState<NewsItem | null>(null);

  return (
    <section
      id="resources"
      className="relative bg-white"
      style={{ fontFamily: theme.fontFamily }}
    >
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
        <div className="text-center">
          <span
            className="inline-block text-xs font-semibold uppercase tracking-[0.2em]"
            style={{ color: theme.accentColor }}
          >
            {dr.eyebrow}
          </span>
          <h2
            className="mx-auto mt-5 max-w-3xl text-3xl leading-[1.2] tracking-tight sm:text-4xl lg:text-5xl"
            style={{ color: theme.textPrimary, fontWeight: 800 }}
          >
            {dr.title}
          </h2>
          <p
            className="mx-auto mt-5 max-w-2xl text-base leading-relaxed sm:text-lg"
            style={{ color: theme.textSecondary }}
          >
            {dr.subtitle}
          </p>
        </div>

        <div className="mt-12 flex justify-center">
          <div
            className="inline-flex flex-wrap justify-center gap-1 rounded-full border p-1"
            style={{
              borderColor: theme.borderSoft,
              background: theme.surfaceMuted,
            }}
          >
            {(["news", "emergency", "brands"] as TabKey[]).map((key) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className="rounded-full px-5 py-2 text-sm font-semibold transition-all sm:px-6"
                  style={{
                    background: active ? theme.accentColor : "transparent",
                    color: active ? "#ffffff" : theme.textSecondary,
                    boxShadow: active
                      ? "0 8px 20px -8px rgba(37,99,235,0.45)"
                      : "none",
                  }}
                >
                  {dr.tabs[key]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-12">
          {tab === "news" && (
            <NewsList items={dr.news.items} onSelect={setActiveNews} />
          )}
          {tab === "emergency" && <EmergencyGrid items={dr.emergency.items} />}
          {tab === "brands" && <BrandLinks items={dr.brands.items} />}
        </div>
      </div>

      <NewsModal news={activeNews} onClose={() => setActiveNews(null)} />
    </section>
  );
}

function NewsList({
  items,
  onSelect,
}: {
  items: readonly NewsItem[];
  onSelect: (n: NewsItem) => void;
}) {
  return (
    <ul
      className="mx-auto max-w-3xl divide-y overflow-hidden rounded-3xl border bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)]"
      style={{ borderColor: theme.borderSoft }}
    >
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="group flex w-full items-start justify-between gap-4 px-5 py-5 text-left transition-colors duration-200 hover:bg-slate-50 sm:px-7 sm:py-6"
          >
            <div className="min-w-0 flex-1">
              <div
                className="flex flex-wrap items-center gap-2 text-xs"
                style={{ color: theme.textSecondary }}
              >
                <span>{item.date}</span>
                <span>·</span>
                <span>{item.source}</span>
              </div>
              <h3
                className="mt-2 text-base tracking-tight transition-colors duration-200 group-hover:text-blue-700 sm:text-lg"
                style={{ color: theme.textPrimary, fontWeight: 700 }}
              >
                {item.title}
              </h3>
              <p
                className="mt-1.5 line-clamp-1 text-sm sm:text-[15px]"
                style={{ color: theme.textSecondary }}
              >
                {item.summary}
              </p>
            </div>
            <span
              className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 group-hover:translate-x-0.5"
              style={{
                background: theme.accentSoft,
                color: theme.accentColor,
              }}
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NewsModal({
  news,
  onClose,
}: {
  news: NewsItem | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!news) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [news, onClose]);

  if (!news) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="news-modal-title"
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      style={{ fontFamily: theme.fontFamily }}
    >
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="dr-fade-in absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <div className="dr-modal-in relative max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div
          className="flex items-start justify-between gap-4 px-6 pt-6 pb-5 sm:px-8 sm:pt-8"
          style={{
            background: `linear-gradient(135deg, ${theme.accentSoft} 0%, #ffffff 100%)`,
          }}
        >
          <div>
            <div
              className="flex items-center gap-2 text-xs"
              style={{ color: theme.textSecondary }}
            >
              <span>{news.date}</span>
              <span>·</span>
              <span>{news.source}</span>
            </div>
            <h3
              id="news-modal-title"
              className="mt-2 text-xl tracking-tight sm:text-2xl"
              style={{ color: theme.textPrimary, fontWeight: 800 }}
            >
              {news.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
          {news.body.split("\n\n").map((para, i) => (
            <p
              key={i}
              className="text-sm leading-relaxed sm:text-base"
              style={{
                color: theme.textPrimary,
                marginTop: i === 0 ? 0 : "1.25rem",
              }}
            >
              {para}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmergencyGrid({
  items,
}: {
  items: typeof dr.emergency.items;
}) {
  return (
    <ul className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-3xl border bg-white p-7 shadow-[0_14px_36px_-22px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 sm:p-8"
          style={{ borderColor: theme.borderSoft }}
        >
          <div className="flex items-start gap-4">
            <span
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
              style={{
                background: theme.accentSoft,
                color: theme.accentColor,
              }}
            >
              <ServiceIcon name={item.iconName as IconName} className="h-6 w-6" />
            </span>
            <div>
              <h3
                className="text-xl tracking-tight sm:text-2xl"
                style={{ color: theme.textPrimary, fontWeight: 700 }}
              >
                {item.title}
              </h3>
              <p
                className="mt-1 text-sm sm:text-[15px]"
                style={{ color: theme.textSecondary }}
              >
                {item.summary}
              </p>
            </div>
          </div>
          <ol className="mt-6 space-y-3">
            {item.steps.map((step, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm leading-relaxed sm:text-[15px]"
                style={{ color: theme.textPrimary }}
              >
                <span
                  className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    background: theme.accentColor,
                    color: "#ffffff",
                  }}
                >
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}

function BrandLinks({
  items,
}: {
  items: typeof dr.brands.items;
}) {
  return (
    <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      {items.map((brand) => (
        <li key={brand.name}>
          <a
            href={brand.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-full flex-col rounded-2xl border bg-white p-5 transition-all duration-300 hover:-translate-y-1 hover:border-blue-300 hover:shadow-[0_14px_30px_-18px_rgba(37,99,235,0.4)]"
            style={{ borderColor: theme.borderSoft }}
          >
            <span
              className="text-base tracking-tight sm:text-lg"
              style={{ color: theme.textPrimary, fontWeight: 700 }}
            >
              {brand.name}
            </span>
            <span
              className="mt-1 truncate text-xs sm:text-sm"
              style={{ color: theme.textSecondary }}
            >
              {brand.domain}
            </span>
            <span
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold transition-colors"
              style={{ color: theme.accentColor }}
            >
              공식 사이트 방문
              <svg
                className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
