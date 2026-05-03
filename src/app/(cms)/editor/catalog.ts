import { BRAND_ROUTES } from "@/lib/brands";
import mainDefaults from "@/data/mainPageData.json";
import brandDefaults from "@/data/brandLandingData.json";

/**
 * CMS 에디터에서 편집 가능한 (page_key, section_key) 카탈로그.
 * - DB 의 page_contents 행과 1:1 대응한다.
 * - 새 섹션을 추가할 때는 여기에 항목을 추가하고 SQL 시드를 함께 갱신한다.
 */

export interface SectionEntry {
  key: string;
  label: string;
  /** Inspector 가 렌더링하지 못하는 케이스(의도적 placeholder) 표시용 */
  hint?: string;
}

export interface PageEntry {
  pageKey: string;
  label: string;
  group: "main" | "brand";
  sections: SectionEntry[];
}

const MAIN_SECTIONS: SectionEntry[] = [
  { key: "theme",            label: "Theme · 디자인 토큰" },
  { key: "header",           label: "Header · 상단 네비게이션" },
  { key: "hero",             label: "Hero · 메인 배너" },
  { key: "about",            label: "About · 회사 소개" },
  { key: "services",         label: "Services · 서비스" },
  { key: "symptoms",         label: "Symptoms · 고장 증상" },
  { key: "process",          label: "Process · 수리 프로세스" },
  { key: "contactForm",      label: "ContactForm · 서비스 접수" },
  { key: "realtimeStatus",   label: "RealtimeStatus · 실시간 현황" },
  { key: "digitalResources", label: "DigitalResources · 디지털 자료실" },
  { key: "footer",           label: "Footer · 하단 푸터" },
];

const BRAND_SECTIONS: SectionEntry[] = [
  { key: "intro", label: "Intro · 브랜드 소개 (섹션 1)" },
];

export const PAGE_CATALOG: PageEntry[] = [
  { pageKey: "main", label: "메인 페이지 (digital-rescue.com)", group: "main", sections: MAIN_SECTIONS },
  ...BRAND_ROUTES.map<PageEntry>((b) => ({
    pageKey: `brand:${b.slug}`,
    label: `${b.displayName} 랜딩 (/${b.slug})`,
    group: "brand",
    sections: BRAND_SECTIONS,
  })),
];

export function findPage(pageKey: string): PageEntry | undefined {
  return PAGE_CATALOG.find((p) => p.pageKey === pageKey);
}

export function findSection(
  pageKey: string,
  sectionKey: string
): SectionEntry | undefined {
  return findPage(pageKey)?.sections.find((s) => s.key === sectionKey);
}

export const DEFAULT_PAGE_KEY = "main";
export const DEFAULT_SECTION_KEY = "theme";

/**
 * 섹션별 기본 데이터 (mainPageData.json / brandLandingData.json 에서 추출).
 * DB에 해당 섹션 row 가 없거나 빈 {} 일 때 deep merge 의 base 로 사용한다.
 * 이를 통해 Inspector 가 항상 완전한 구조의 폼을 렌더링할 수 있다.
 */
const _m = mainDefaults as unknown as Record<string, Record<string, unknown>>;
const _b = brandDefaults as unknown as {
  brands: { samsung: { intro: Record<string, unknown> } };
};

export const SECTION_DEFAULTS: Record<string, Record<string, unknown>> = {
  theme:            _m.theme            ?? {},
  header:           _m.header           ?? {},
  hero:             _m.hero             ?? {},
  about:            _m.about            ?? {},
  services:         _m.services         ?? {},
  symptoms:         _m.symptoms         ?? {},
  process:          _m.process          ?? {},
  contactForm:      _m.contactForm      ?? {},
  realtimeStatus:   _m.realtimeStatus   ?? {},
  digitalResources: _m.digitalResources ?? {},
  footer:           _m.footer           ?? {},
  // 브랜드 섹션 공통 폴백 — 실제 콘텐츠는 DB 값으로 덮어쓴다
  intro:            _b.brands.samsung.intro ?? {},
};
