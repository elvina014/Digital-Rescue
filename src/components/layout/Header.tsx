"use client";

import { useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import defaults from "@/data/mainPageData.json";
import { findBrandRoute } from "@/lib/brands";
import type { HeaderData, ThemeData } from "@/types/sections";

const DEFAULT_HEADER = defaults.header as HeaderData;
const DEFAULT_THEME = defaults.theme as ThemeData;

/** 방문자가 처음 들어온 랜딩 페이지("/" 또는 "/samsung" 등). 탭을 닫으면 사라진다. */
const LANDING_KEY = "dr_landing";
/** 브랜드 랜딩페이지에 있는 섹션. 이 밖의 섹션 메뉴(회사소개 등)는 브랜드 방문자에게 숨긴다. */
const BRAND_SECTION_IDS = ["process", "contact"];

/** 지금 경로가 랜딩 페이지면 그 경로("/" 또는 "/samsung"), 아니면 null */
function landingPathOf(pathname: string): string | null {
  if (pathname === "/") return "/";
  const slug = pathname.split("/").filter(Boolean);
  return slug.length === 1 && findBrandRoute(slug[0]) ? `/${slug[0]}` : null;
}

const noSubscribe = () => () => {};
function readStoredLanding(): string | null {
  try {
    return sessionStorage.getItem(LANDING_KEY);
  } catch {
    return null; // 저장소를 쓸 수 없으면 메인을 홈으로 둔다
  }
}

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
  const pathname = usePathname();

  // 홈(로고·섹션 메뉴의 목적지): 랜딩 페이지에 있으면 그 페이지, 그 밖(개인정보처리방침 등)에서는
  // 처음 들어온 랜딩 페이지. 서버 렌더에서는 알 수 없으므로 "/"로 그린 뒤 마운트 후 바꾼다.
  const currentLanding = landingPathOf(pathname);
  const storedLanding = useSyncExternalStore(noSubscribe, readStoredLanding, () => null);
  useEffect(() => {
    try {
      if (currentLanding && !sessionStorage.getItem(LANDING_KEY)) sessionStorage.setItem(LANDING_KEY, currentLanding);
    } catch {
      // 저장소를 쓸 수 없으면 기록하지 않는다
    }
  }, [currentLanding]);
  const home = currentLanding ?? storedLanding ?? "/";
  const isBrandHome = home !== "/";

  // 섹션 링크("#process"): 홈이 아닌 페이지에서는 홈의 해당 섹션으로 보낸다.
  // 지금 페이지에 같은 섹션이 있으면 직접 스크롤한다
  // (Next 링크에 맡기면 다른 페이지에서 넘어온 뒤 주소가 "#services#process"처럼 중복된다).
  const navLinks = (data.navLinks ?? []).filter(
    (link) => !isBrandHome || !link.href?.startsWith("#") || BRAND_SECTION_IDS.includes(link.href.slice(1))
  );
  const navHref = (href: string) => (href.startsWith("#") && pathname !== home ? `${home}${href}` : href);
  const scrollIfOnPage = (e: MouseEvent, href: string) => {
    if (!href.startsWith("#")) return;
    const target = document.getElementById(href.slice(1));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView();
    window.history.replaceState(null, "", href);
  };

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
        {/* 다른 페이지에서는 홈으로 이동, 홈에서는 맨 위로 스크롤 ("/#hero"는 Next가 해시를 중복으로 붙여 쓰지 않음) */}
        <Link
          href={home}
          onClick={(e) => {
            if (pathname === home) {
              e.preventDefault();
              window.scrollTo({ top: 0 });
              window.history.replaceState(null, "", home);
            }
          }}
          className="flex items-center gap-2"
        >
          <span
            className="text-xl font-extrabold tracking-tight"
            style={{ color: theme.textPrimary }}
          >
            {data.brand?.leadText}
            <span style={{ color: theme.accentColor }}>{data.brand?.accentText}</span>
          </span>
        </Link>

        {/* 데스크톱 네비게이션 */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href ?? link.label}
              href={navHref(link.href ?? '#')}
              onClick={(e) => scrollIfOnPage(e, link.href ?? '#')}
              className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-slate-100"
              style={{ color: theme.textSecondary }}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={data.cta?.href ?? '#'}
            className="ml-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: theme.accentColor }}
          >
            {data.cta?.label}
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
          {navLinks.map((link) => (
            <Link
              key={link.href ?? link.label}
              href={navHref(link.href ?? '#')}
              onClick={(e) => {
                setMenuOpen(false);
                scrollIfOnPage(e, link.href ?? '#');
              }}
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
