"use client";

import { Component, type ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HeroSection } from "@/components/main/HeroSection";
import { AboutSection } from "@/components/main/AboutSection";
import { ServicesSection } from "@/components/main/ServicesSection";
import { DigitalResourcesSection } from "@/components/main/DigitalResourcesSection";
import { SymptomsSection } from "@/components/common/SymptomsSection";
import { ProcessSection } from "@/components/common/ProcessSection";
import { ContactForm } from "@/components/common/ContactForm";
import { RealtimeStatus } from "@/components/common/RealtimeStatus";
import { BrandIntroSection } from "@/components/brand/BrandIntroSection";
import type {
  AboutSectionData,
  BrandIntroData,
  ContactFormData,
  DigitalResourcesData,
  FooterData,
  HeaderData,
  HeroSectionData,
  ProcessSectionData,
  RealtimeStatusData,
  ServicesSectionData,
  SymptomsSectionData,
  ThemeData,
} from "@/types/sections";

interface PreviewProps {
  pageKey: string;
  sectionKey: string;
  content: Record<string, unknown>;
  theme: Record<string, unknown>;
}

/**
 * DB에 해당 섹션 row가 없으면 content = {}.
 * 빈 객체를 undefined로 변환해 각 컴포넌트의 built-in default가 활성화되도록 한다.
 * (default 파라미터는 undefined일 때만 작동하므로, {}를 그대로 넘기면 무시됨)
 */
function emptyToUndefined(val: unknown): unknown {
  if (
    val !== null &&
    typeof val === "object" &&
    !Array.isArray(val) &&
    Object.keys(val as Record<string, unknown>).length === 0
  ) {
    return undefined;
  }
  return val;
}

export function Preview({ pageKey, sectionKey, content, theme }: PreviewProps) {
  return (
    <PreviewBoundary
      cacheKey={`${pageKey}/${sectionKey}`}
      contentKey={JSON.stringify(content).slice(0, 300)}
    >
      <PreviewBody
        pageKey={pageKey}
        sectionKey={sectionKey}
        content={content}
        theme={theme}
      />
    </PreviewBoundary>
  );
}

// ────────────────────────── Body 디스패처 ──────────────────────────

function PreviewBody({
  pageKey,
  sectionKey,
  content,
  theme,
}: PreviewProps) {
  // 편집 중인 JSON 은 임의의 모양일 수 있으므로 unknown 으로 좁힌 뒤
  // 각 섹션 컴포넌트의 기대 타입으로 단언한다. 잘못된 모양이면 PreviewBoundary 가 잡는다.
  const t = theme as unknown as ThemeData;
  // 빈 객체(DB row 미존재)는 undefined로 변환 → 컴포넌트 built-in default 활성화
  const c = emptyToUndefined(content) as unknown;

  // theme 자체 편집 시 — 색/폰트 토큰을 시각적 swatch 로 표시
  // ⚠️ c(=content)가 undefined일 수 있으므로 t(=theme prop)를 사용한다.
  if (pageKey === "main" && sectionKey === "theme") {
    return <ThemePreview theme={t} />;
  }

  // 브랜드 페이지 — intro 섹션
  if (pageKey.startsWith("brand:") && sectionKey === "intro") {
    const slug = pageKey.slice("brand:".length);
    // c가 undefined일 수 있으므로 옵셔널 체이닝으로 displayName을 읽는다.
    const data = c as (BrandIntroData & { displayName?: string }) | undefined;
    return (
      <BrandIntroSection
        data={data}
        theme={t}
        displayName={data?.displayName ?? slug}
      />
    );
  }

  if (pageKey === "main") {
    switch (sectionKey) {
      case "header":
        return <Header data={c as HeaderData} theme={t} />;
      case "footer":
        return <Footer data={c as FooterData} theme={t} />;
      case "hero":
        return <HeroSection data={c as HeroSectionData} theme={t} />;
      case "about":
        return <AboutSection data={c as AboutSectionData} theme={t} />;
      case "services":
        return <ServicesSection data={c as ServicesSectionData} theme={t} previewMode />;
      case "symptoms":
        return <SymptomsSection data={c as SymptomsSectionData} theme={t} />;
      case "process":
        return <ProcessSection data={c as ProcessSectionData} theme={t} />;
      case "contactForm":
        return <ContactForm data={c as ContactFormData} theme={t} />;
      case "realtimeStatus":
        return <RealtimeStatus data={c as RealtimeStatusData} theme={t} />;
      case "digitalResources":
        return <DigitalResourcesSection data={c as DigitalResourcesData} theme={t} />;
    }
  }

  return (
    <NoticeBox>
      이 섹션은 아직 라이브 미리보기가 연결되지 않았습니다.
      <br />
      오른쪽 설정창에서 JSON 을 직접 편집할 수 있습니다.
    </NoticeBox>
  );
}

// ────────────────────────── theme 전용 프리뷰 ──────────────────────────

function ThemePreview({ theme }: { theme: ThemeData }) {
  const colors: { key: keyof ThemeData; label: string }[] = [
    { key: "accentColor",    label: "Accent" },
    { key: "accentSoft",     label: "Accent Soft" },
    { key: "textPrimary",    label: "Text Primary" },
    { key: "textSecondary",  label: "Text Secondary" },
    { key: "surface",        label: "Surface" },
    { key: "surfaceMuted",   label: "Surface Muted" },
    { key: "borderSoft",     label: "Border Soft" },
  ];

  return (
    <div className="p-8" style={{ fontFamily: theme.fontFamily }}>
      <h1
        className="text-3xl font-extrabold tracking-tight"
        style={{ color: theme.textPrimary }}
      >
        Theme · 디자인 토큰 미리보기
      </h1>
      <p className="mt-2 text-sm" style={{ color: theme.textSecondary }}>
        편집한 색상이 즉시 swatch 와 샘플 텍스트에 반영됩니다.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {colors.map((c) => (
          <li
            key={c.key}
            className="rounded-2xl border bg-white p-4 shadow-sm"
            style={{ borderColor: theme.borderSoft }}
          >
            <div
              className="h-16 w-full rounded-xl border"
              style={{
                background: String(theme[c.key] ?? ""),
                borderColor: theme.borderSoft,
              }}
            />
            <div
              className="mt-3 text-xs font-semibold"
              style={{ color: theme.textPrimary }}
            >
              {c.label}
            </div>
            <div
              className="mt-0.5 font-mono text-[10px]"
              style={{ color: theme.textSecondary }}
            >
              {String(theme[c.key] ?? "")}
            </div>
          </li>
        ))}
      </ul>

      <div
        className="mt-8 rounded-2xl border p-6"
        style={{
          background: theme.surfaceMuted,
          borderColor: theme.borderSoft,
        }}
      >
        <span
          className="inline-block text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: theme.accentColor }}
        >
          Sample Eyebrow
        </span>
        <h2
          className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl"
          style={{ color: theme.textPrimary }}
        >
          제목 샘플 — 본문 가독성 미리보기
        </h2>
        <p className="mt-3 text-sm" style={{ color: theme.textSecondary }}>
          이 텍스트는 textPrimary / textSecondary / accentColor 의 조합을
          확인하기 위한 샘플입니다.
        </p>
        <button
          type="button"
          className="mt-5 rounded-2xl px-5 py-3 text-sm font-bold text-white"
          style={{ background: theme.accentColor }}
        >
          Sample CTA
        </button>
      </div>
    </div>
  );
}

// ────────────────────────── Notice ──────────────────────────

function NoticeBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm leading-relaxed text-slate-500 shadow-sm">
        {children}
      </div>
    </div>
  );
}

// ────────────────────────── Error Boundary ──────────────────────────

interface BoundaryProps {
  children: ReactNode;
  /** 키가 바뀌면 boundary state 가 리셋된다 (페이지/섹션 전환 시) */
  cacheKey: string;
  /** content 직렬화 일부 — 변경 시 에러 자동 복구 재시도 */
  contentKey?: string;
}

interface BoundaryState {
  error: Error | null;
}

class PreviewBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (
      this.state.error &&
      (prev.cacheKey !== this.props.cacheKey ||
        prev.contentKey !== this.props.contentKey)
    ) {
      this.setState({ error: null });
    }
  }

  // 콘텐츠 변경(편집)으로 새 props 가 들어와 다시 렌더링될 때, 직전 에러를
  // 자동으로 클리어해 사용자가 빠르게 복구할 수 있게 한다.
  UNSAFE_componentWillReceiveProps?(): void {
    /* noop */
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          <p className="font-bold">미리보기 렌더 오류</p>
          <p className="mt-2 font-mono text-xs">{this.state.error.message}</p>
          <p className="mt-3 text-xs text-red-600">
            오른쪽 설정창에서 잘못된 값을 수정하면 다시 시도됩니다.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
          >
            다시 시도
          </button>
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}
