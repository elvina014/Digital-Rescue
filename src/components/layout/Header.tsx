"use client";

import { useState } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { label: "회사소개", href: "#about" },
  { label: "서비스 안내", href: "#services" },
  { label: "수리 과정", href: "#process" },
  { label: "접수하기", href: "#contact" },
  { label: "내역조회", href: "/lookup" },
] as const;

/**
 * 대고객 페이지 헤더
 * 좌측 로고 + 우측 네비게이션 (모바일: 햄버거 메뉴)
 */
export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* 로고 */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-extrabold tracking-tight text-slate-900">
            디지털<span className="text-blue-600">레스큐</span>
          </span>
        </Link>

        {/* 데스크톱 네비게이션 */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="tel:010-0000-0000"
            className="ml-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            전화 상담
          </Link>
        </nav>

        {/* 모바일 햄버거 */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
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
        <nav className="border-t border-slate-200 bg-white px-4 pb-4 md:hidden">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
