"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import brandDefaults from "@/data/brandLandingData.json";
import mainDefaults from "@/data/mainPageData.json";
import type { BrandIntroData, ThemeData } from "@/types/sections";
import { ServiceIcon, type IconName } from "@/components/common/icons";

// 기본값: brandLandingData.json 의 samsung 항목을 일반 폴백으로 사용
//  - 실제 운영에서는 DB(page_contents) 의 brand:{slug} / intro 행에서 주입됨
const DEFAULT_BRAND_INTRO = brandDefaults.brands.samsung.intro as BrandIntroData;
const DEFAULT_THEME = mainDefaults.theme as ThemeData;
const DEFAULT_DISPLAY_NAME = brandDefaults.brands.samsung.displayName;

interface BrandIntroSectionProps {
  data?: BrandIntroData;
  theme?: ThemeData;
  /** 표시용 브랜드 이름. 화려한 외곽 텍스트(워터마크) 등에 사용된다. */
  displayName?: string;
}

/**
 * 랜딩페이지 섹션 1 — 서비스 및 회사 소개
 * - 다른 공통 섹션과 대비되도록 어두운 그라디언트 배경 + 컬러 블롭 + 큼직한 워터마크 사용
 * - 진입 애니메이션: 헤드라인 단어별 슬라이드업, 하이라이트 카드 스태거 페이드인
 * - 마우스 위치에 따라 부드럽게 따라오는 스포트라이트 효과
 * - CMS(edit.digital-rescue.com) 에서 brandLandingData.json 의 intro 항목을 편집해 모든 텍스트 변경
 */
export function BrandIntroSection({
  data = DEFAULT_BRAND_INTRO,
  theme = DEFAULT_THEME,
  displayName = DEFAULT_DISPLAY_NAME,
}: BrandIntroSectionProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [mounted, setMounted] = useState(false);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({
    x: 50,
    y: 50,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = sectionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPointer({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <section
      ref={sectionRef}
      onPointerMove={handlePointerMove}
      id="brand-intro"
      className="brand-intro-section relative overflow-hidden"
      style={{
        fontFamily: theme.fontFamily,
        background:
          "radial-gradient(circle at 20% 0%, #1e3a8a 0%, #0f172a 45%, #020617 100%)",
      }}
    >
      <span
        aria-hidden
        className="brand-intro-spotlight pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(600px circle at ${pointer.x}% ${pointer.y}%, rgba(96,165,250,0.18), transparent 70%)`,
          transition: "background 200ms ease-out",
        }}
      />

      <span
        aria-hidden
        className="brand-intro-blob pointer-events-none absolute"
        style={{
          top: "-20%",
          left: "-10%",
          width: "640px",
          height: "640px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(59,130,246,0.45) 0%, transparent 70%)",
          filter: "blur(80px)",
          animation: "brand-intro-blob-a 14s ease-in-out infinite alternate",
        }}
      />
      <span
        aria-hidden
        className="brand-intro-blob pointer-events-none absolute"
        style={{
          bottom: "-25%",
          right: "-15%",
          width: "720px",
          height: "720px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 70%)",
          filter: "blur(90px)",
          animation: "brand-intro-blob-b 18s ease-in-out infinite alternate",
        }}
      />

      <span
        aria-hidden
        className="brand-intro-watermark pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <span
          className="select-none text-[28vw] font-black leading-none tracking-tighter sm:text-[20vw]"
          style={{
            color: "rgba(148,163,184,0.06)",
            letterSpacing: "-0.04em",
            transform: mounted ? "scale(1)" : "scale(1.05)",
            opacity: mounted ? 1 : 0,
            transition:
              "opacity 1200ms ease-out, transform 1200ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {displayName}
        </span>
      </span>

      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32 lg:py-40">
        <div className="text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold tracking-[0.2em] text-blue-200 backdrop-blur-sm"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(-8px)",
              transition:
                "opacity 700ms ease-out 100ms, transform 700ms ease-out 100ms",
            }}
          >
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-300" />
            {data.eyebrow}
          </span>

          <h1 className="mx-auto mt-7 max-w-4xl text-4xl leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl">
            {(data.headline?.lines ?? []).map((line, i) => (
              <span
                key={`${i}-${line.text}`}
                className="block overflow-hidden"
              >
                <span
                  className="inline-block"
                  style={{
                    fontWeight: 900,
                    background: line.emphasis
                      ? "linear-gradient(135deg, #93c5fd 0%, #c4b5fd 50%, #f0abfc 100%)"
                      : "transparent",
                    WebkitBackgroundClip: line.emphasis ? "text" : undefined,
                    backgroundClip: line.emphasis ? "text" : undefined,
                    color: line.emphasis ? "transparent" : "#ffffff",
                    transform: mounted ? "translateY(0)" : "translateY(110%)",
                    opacity: mounted ? 1 : 0,
                    transition: `opacity 800ms cubic-bezier(0.22, 1, 0.36, 1) ${250 + i * 120}ms, transform 900ms cubic-bezier(0.22, 1, 0.36, 1) ${250 + i * 120}ms`,
                  }}
                >
                  {line.text}
                </span>
              </span>
            ))}
          </h1>

          <p
            className="mx-auto mt-7 max-w-2xl whitespace-pre-line text-base leading-relaxed text-slate-300 sm:text-lg"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
              transition:
                "opacity 800ms ease-out 700ms, transform 800ms ease-out 700ms",
            }}
          >
            {data.subheadline}
          </p>

          <div
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? "translateY(0)" : "translateY(12px)",
              transition:
                "opacity 800ms ease-out 900ms, transform 800ms ease-out 900ms",
            }}
          >
            {(data.ctas ?? []).map((cta) => (
              <Link
                key={cta.label}
                href={cta.href ?? '#'}
                className={
                  cta.variant === "primary"
                    ? "group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-8 py-4 text-sm font-bold text-white shadow-[0_18px_40px_-16px_rgba(59,130,246,0.7)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_22px_50px_-16px_rgba(96,165,250,0.85)] sm:w-auto"
                    : "group inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-8 py-4 text-sm font-bold text-white backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:border-white/40 hover:bg-white/10 sm:w-auto"
                }
                style={
                  cta.variant === "primary"
                    ? {
                        background:
                          "linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)",
                      }
                    : undefined
                }
              >
                {cta.variant === "primary" && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                  />
                )}
                <span className="relative">{cta.label}</span>
                <svg
                  className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>

        <ul className="mt-20 grid gap-4 sm:mt-24 sm:grid-cols-3 sm:gap-5">
          {(data.highlights ?? []).map((h, i) => (
            <HighlightCard
              key={`${i}-${h.title}`}
              index={i}
              iconName={h.iconName as IconName}
              title={h.title}
              description={h.description}
              mounted={mounted}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function HighlightCard({
  index,
  iconName,
  title,
  description,
  mounted,
}: {
  index: number;
  iconName: IconName;
  title: string;
  description: string;
  mounted: boolean;
}) {
  return (
    <li
      className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-1 hover:border-white/25 hover:bg-white/10 sm:p-7"
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? "translateY(0)" : "translateY(20px)",
        transition: `opacity 800ms ease-out ${1100 + index * 120}ms, transform 800ms ease-out ${1100 + index * 120}ms, background-color 300ms ease-out, border-color 300ms ease-out, translate 300ms ease-out`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-gradient-to-r from-transparent via-blue-300/60 to-transparent transition-transform duration-500 group-hover:scale-x-100"
      />

      <div
        className="inline-flex h-14 w-14 items-center justify-center rounded-2xl text-blue-200 transition-transform duration-300 group-hover:scale-110"
        style={{
          background:
            "linear-gradient(135deg, rgba(59,130,246,0.3) 0%, rgba(168,85,247,0.25) 100%)",
          boxShadow: "0 10px 30px -12px rgba(59,130,246,0.5)",
        }}
      >
        <ServiceIcon name={iconName} className="h-7 w-7" />
      </div>

      <h3 className="mt-5 text-lg font-bold tracking-tight text-white sm:text-xl">
        {title}
      </h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-300 sm:text-[15px]">
        {description}
      </p>
    </li>
  );
}
