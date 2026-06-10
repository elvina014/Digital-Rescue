"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import defaults from "@/data/mainPageData.json";
import type {
  DigitalResourcesData,
  DigitalResourcesNewsItem,
  DigitalResourcesEmergencyItem,
  DigitalResourcesBrandItem,
  ThemeData,
} from "@/types/sections";
import { ServiceIcon, type IconName } from "@/components/common/icons";

const DEFAULT_DIGITAL_RESOURCES = defaults.digitalResources as DigitalResourcesData;
const DEFAULT_THEME = defaults.theme as ThemeData;

/** 게시판 한 페이지에 노출할 뉴스 개수 */
const NEWS_PER_PAGE = 4;

type NewsItem = DigitalResourcesNewsItem;
type TabKey = "news" | "emergency" | "brands";

interface DigitalResourcesSectionProps {
  data?: DigitalResourcesData;
  theme?: ThemeData;
}

export function DigitalResourcesSection({
  data: dr = DEFAULT_DIGITAL_RESOURCES,
  theme = DEFAULT_THEME,
}: DigitalResourcesSectionProps) {
  const [tab, setTab] = useState<TabKey>("news");
  const [newsPage, setNewsPage] = useState(0);
  // 모달에서 보고 있는 뉴스의 전체 인덱스 (null = 닫힘)
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const newsItems = dr.news?.items ?? [];

  // 이어보기로 페이지 경계를 넘어가면 뒤의 목록 페이지도 함께 이동시켜,
  // 모달을 닫았을 때 마지막으로 본 글이 있는 페이지가 보이도록 한다.
  const navigateNews = useCallback((index: number) => {
    setActiveIndex(index);
    setNewsPage(Math.floor(index / NEWS_PER_PAGE));
  }, []);

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
                  {dr.tabs?.[key] ?? key}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-12">
          {tab === "news" && (
            <NewsList
              items={newsItems}
              page={newsPage}
              onPageChange={setNewsPage}
              onSelect={setActiveIndex}
              theme={theme}
            />
          )}
          {tab === "emergency" && (
            <EmergencyGrid items={dr.emergency?.items ?? []} theme={theme} />
          )}
          {tab === "brands" && (
            <BrandLinks items={dr.brands?.items ?? []} theme={theme} />
          )}
        </div>
      </div>

      {activeIndex !== null && newsItems[activeIndex] && (
        <NewsCarouselModal
          items={newsItems}
          currentIndex={activeIndex}
          onClose={() => setActiveIndex(null)}
          onNavigate={navigateNews}
          theme={theme}
        />
      )}
    </section>
  );
}

function NewsList({
  items,
  page,
  onPageChange,
  onSelect,
  theme,
}: {
  items: readonly NewsItem[];
  page: number;
  onPageChange: (page: number) => void;
  onSelect: (index: number) => void;
  theme: ThemeData;
}) {
  const totalPages = Math.max(1, Math.ceil(items.length / NEWS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * NEWS_PER_PAGE;
  const pageItems = items.slice(start, start + NEWS_PER_PAGE);

  return (
    <div className="mx-auto max-w-3xl">
      <ul
        className="divide-y overflow-hidden rounded-3xl border bg-white shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18)]"
        style={{ borderColor: theme.borderSoft }}
      >
        {pageItems.map((item, i) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(start + i)}
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

      {totalPages > 1 && (
        <NewsPagination
          totalPages={totalPages}
          page={safePage}
          onPageChange={onPageChange}
          theme={theme}
        />
      )}
    </div>
  );
}

function NewsPagination({
  totalPages,
  page,
  onPageChange,
  theme,
}: {
  totalPages: number;
  page: number;
  onPageChange: (page: number) => void;
  theme: ThemeData;
}) {
  const go = (next: number) => {
    if (next < 0 || next > totalPages - 1) return;
    onPageChange(next);
  };

  return (
    <nav
      className="mt-8 flex items-center justify-center gap-1.5"
      aria-label="뉴스 페이지"
    >
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page === 0}
        aria-label="이전 페이지"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
        style={{ borderColor: theme.borderSoft, color: theme.textSecondary }}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {Array.from({ length: totalPages }, (_, i) => {
        const active = i === page;
        return (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-current={active ? "page" : undefined}
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-sm font-semibold transition-all"
            style={{
              background: active ? theme.accentColor : "transparent",
              color: active ? "#ffffff" : theme.textSecondary,
              border: active ? "none" : `1px solid ${theme.borderSoft}`,
              boxShadow: active ? "0 8px 20px -8px rgba(37,99,235,0.45)" : "none",
            }}
          >
            {i + 1}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page === totalPages - 1}
        aria-label="다음 페이지"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
        style={{ borderColor: theme.borderSoft, color: theme.textSecondary }}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

/**
 * 뉴스 상세 모달 — 이미지 뷰어처럼 이전/다음 글을 이어 볼 수 있는 캐러셀.
 * Embla 기반: 데스크탑 좌/우 화살표 + 모바일 좌우 스와이프 + 키보드 ←/→/Esc.
 * (src/components/common/Lightbox.tsx 패턴 재사용)
 */
function NewsCarouselModal({
  items,
  currentIndex,
  onClose,
  onNavigate,
  theme,
}: {
  items: readonly NewsItem[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  theme: ThemeData;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    startIndex: currentIndex,
    loop: false,
  });

  // 슬라이드 변경 → 부모 인덱스 동기화 (렌더 외부에서 ref 갱신: React Compiler 규칙 준수)
  const onSelectRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    onSelectRef.current = () => {
      if (!emblaApi) return;
      const selected = emblaApi.selectedScrollSnap();
      if (selected !== currentIndex) onNavigate(selected);
    };
  });

  useEffect(() => {
    if (!emblaApi) return;
    const handler = () => onSelectRef.current?.();
    emblaApi.on("select", handler);
    return () => {
      emblaApi.off("select", handler);
    };
  }, [emblaApi]);

  // 외부 인덱스 변경 시 캐러셀 위치 동기화
  useEffect(() => {
    if (!emblaApi) return;
    if (emblaApi.selectedScrollSnap() !== currentIndex) {
      emblaApi.scrollTo(currentIndex, false);
    }
  }, [emblaApi, currentIndex]);

  // 키보드 단축키 + 스크롤 잠금
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") emblaApi?.scrollPrev();
      if (e.key === "ArrowRight") emblaApi?.scrollNext();
    },
    [onClose, emblaApi]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

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

      <div className="dr-modal-in relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-4 top-4 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
        >
          <X className="h-5 w-5" />
        </button>

        {/* 이전/다음 화살표 (데스크탑) */}
        <button
          type="button"
          onClick={() => emblaApi?.scrollPrev()}
          disabled={!hasPrev}
          aria-label="이전 글"
          className="absolute left-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md backdrop-blur-sm transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-20 sm:flex"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => emblaApi?.scrollNext()}
          disabled={!hasNext}
          aria-label="다음 글"
          className="absolute right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-md backdrop-blur-sm transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-20 sm:flex"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Embla 뷰포트 */}
        <div ref={emblaRef} className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full touch-pan-y">
            {items.map((news, idx) => (
              <article
                key={news.id}
                className="flex h-full min-w-0 flex-[0_0_100%] flex-col"
                aria-hidden={idx !== currentIndex}
              >
                <div
                  className="px-6 pt-6 pb-5 sm:px-12 sm:pt-8"
                  style={{
                    background: `linear-gradient(135deg, ${theme.accentSoft} 0%, #ffffff 100%)`,
                  }}
                >
                  <div
                    className="flex items-center gap-2 text-xs"
                    style={{ color: theme.textSecondary }}
                  >
                    <span>{news.date}</span>
                    <span>·</span>
                    <span>{news.source}</span>
                  </div>
                  <h3
                    id={idx === currentIndex ? "news-modal-title" : undefined}
                    className="mt-2 text-xl tracking-tight sm:text-2xl"
                    style={{ color: theme.textPrimary, fontWeight: 800 }}
                  >
                    {news.title}
                  </h3>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-12 sm:py-8">
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
              </article>
            ))}
          </div>
        </div>

        {/* 카운터 + 이동 안내 */}
        <div
          className="flex shrink-0 items-center justify-center gap-2 border-t px-6 py-3 text-xs"
          style={{ borderColor: theme.borderSoft, color: theme.textSecondary }}
        >
          <span className="tabular-nums">
            {currentIndex + 1} / {items.length}
          </span>
          <span className="hidden sm:inline">· ← → 키 또는 화살표로 이동</span>
          <span className="sm:hidden">· 좌우로 넘겨 보기</span>
        </div>
      </div>
    </div>
  );
}

function EmergencyGrid({
  items,
  theme,
}: {
  items: DigitalResourcesEmergencyItem[];
  theme: ThemeData;
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
  theme,
}: {
  items: DigitalResourcesBrandItem[];
  theme: ThemeData;
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
