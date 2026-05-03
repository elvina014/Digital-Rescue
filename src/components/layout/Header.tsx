"use client";

import { useState } from "react";
import Link from "next/link";
import defaults from "@/data/mainPageData.json";
import type { HeaderData, ThemeData } from "@/types/sections";

const DEFAULT_HEADER = defaults.header as HeaderData;
const DEFAULT_THEME = defaults.theme as ThemeData;

interface HeaderProps {
  data?: HeaderData;
  theme?: ThemeData;
}

/**
 * 대고객 페이지 헤더 — DB(page_contents → main:header)에서 주입.
 * 데이터 미주입 시 src/data/mainPageData.json 의 header 값으로 폴백.
 *
 * 디자인 토큰(색상/폰트)은 theme prop 의 값을 인라인 스타일로 적용한다 —
 * Tailwind 클래스는 레이아웃/간격만 담당.
 */
export function Header({ data = DEFAULT_HEADER, theme = DEFAULT_THEME }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50 border-b backdrop-blur-sm"
      style={{
        background: `${theme.surface}f2`, // surface + ~95% alpha
        borderColor: theme.borderSoft,
        fontFamily: theme.fontFamily,
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* 로고 */}
        <Link href={data.brand.href} className="flex items-center gap-2">
          <span
            className="text-xl font-extrabold tracking-tight"
            style={{ color: theme.textPrimary }}
          >
            {data.brand.leadText}
            <span style={{ color: theme.accentColor }}>{data.brand.accentText}</span>
          </span>
        </Link>

        {/* 데스크톱 네비게이션 */}
        <nav className="hidden items-center gap-1 md:flex">
          {data.navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-100"
              style={{ color: theme.textSecondary }}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={data.cta.href}
            className="ml-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: theme.accentColor }}
          >
            {data.cta.label}
          </Link>
        </nav>

        {/* 모바일 햄버거 */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-slate-100 md:hidden"
          style={{ color: theme.textSecondary }}
          aria-label="메뉴 열기"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      {menuOpen && (
        <nav
          className="border-t px-4 pb-4 md:hidden"
          style={{ borderColor: theme.borderSoft, background: theme.surface }}
        >
          {data.navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-slate-100"
              style={{ color: theme.textPrimary }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
