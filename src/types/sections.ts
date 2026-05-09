/**
 * 메인페이지 + 브랜드 랜딩페이지에서 공통으로 사용되는 섹션 데이터 타입.
 * - 컴포넌트는 이 타입의 값을 props로 받아 렌더링한다.
 * - 실제 값은 src/data/mainPageData.json 또는 brandLandingData.json 에서 주입된다.
 * - 추후 edit.digital-rescue.com(CMS)에서 동일 스키마로 편집된다.
 */

export interface ThemeData {
  fontFamily: string;
  accentColor: string;
  accentSoft: string;
  textPrimary: string;
  textSecondary: string;
  surface: string;
  surfaceMuted: string;
  borderSoft: string;
  radius: string;
}

export interface SymptomItem {
  id: string;
  title: string;
  shortDescription: string;
  imageUrl: string;
  iconName: string;
  modal: {
    headline: string;
    expectedParts: string[];
    repairMethod: string;
  };
}

export interface SymptomsSectionData {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
  items: SymptomItem[];
}

export interface ProcessStep {
  step: string;
  title: string;
  description: string;
  iconName: string;
}

export interface ProcessSectionData {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaTarget: string;
  ctaHint: string;
  steps: ProcessStep[];
}

export interface RealtimeStatusData {
  eyebrow: string;
  title: string;
  subtitle: string;
  refreshIntervalMinutes: number;
  rowCount: number;
  columns: {
    name: string;
    device: string;
    symptom: string;
    status: string;
  };
  statuses: { label: string; color: string }[];
  dummyData: {
    names: string[];
    devices: string[];
    symptoms: string[];
  };
}

export interface ContactFormReceiptType {
  value: string;
  label: string;
}

export interface ContactFormDeviceType {
  value: string;
  label: string;
}

export interface ContactFormDynamicGuide {
  tone: string;
  message: string;
  extras?: {
    type: string;
    name: string;
    label: string;
    options?: { value: string; label: string }[];
  }[];
  address?: { label: string; value: string };
}

export interface ContactFormData {
  eyebrow: string;
  title: string;
  subtitle: string;
  labels: {
    name: string;
    namePlaceholder: string;
    phone: string;
    phonePlaceholder: string;
    address: string;
    addressPlaceholder: string;
    receiptType: string;
    deviceType: string;
    deviceBrand: string;
    deviceModel: string;
    deviceModelPlaceholder: string;
    symptoms: string;
    symptomsPlaceholder: string;
    photos: string;
    submit: string;
    submitting: string;
  };
  footnote: string;
  receiptTypes: ContactFormReceiptType[];
  deviceTypes: ContactFormDeviceType[];
  brands: string[];
  maxImages: number;
  dynamicGuides: Record<string, ContactFormDynamicGuide>;
}

export interface BrandIntroHighlight {
  iconName: string;
  title: string;
  description: string;
}

export interface BrandIntroData {
  eyebrow: string;
  headline: { lines: { text: string; emphasis: boolean }[] };
  subheadline: string;
  highlights: BrandIntroHighlight[];
  ctas: { label: string; href: string; variant: "primary" | "ghost" }[];
}

export interface BrandLandingEntry {
  slug: string;
  displayName: string;
  formBrandValue: string | null;
  formDeviceType: string | null;
  intro: BrandIntroData;
}

// ---------- 레이아웃 (Header / Footer) ----------

export interface HeaderData {
  brand: {
    /** 강조 전 부분 — 예: "디지털" */
    leadText: string;
    /** 강조 부분 — 예: "레스큐" */
    accentText: string;
    href: string;
  };
  navLinks: { label: string; href: string }[];
  cta: {
    label: string;
    href: string;
  };
}

export interface FooterColumn {
  title: string;
  items: { label: string; href?: string; external?: boolean }[];
}

export interface FooterData {
  brand: {
    leadText: string;
    accentText: string;
    intro: string;
  };
  columns: FooterColumn[];
  business: { label: string; value: string }[];
  disclaimer: string;
  /** %YEAR% 토큰은 현재 연도로 자동 치환 */
  copyright: string;
}

// ---------- 메인 전용 섹션 ----------

export interface HeroSectionData {
  badge: { text: string; show: boolean };
  headline: {
    lines: { text: string; emphasis: boolean }[];
    weight: number;
    tracking: string;
  };
  subheadline: string;
  ctas: { label: string; href: string; variant: "primary" | "ghost" }[];
  background: {
    type: string;
    imageUrl: string;
    blobs: { color: string; x: string; y: string; size: string; blur: string }[];
  };
  trustStats: { id?: string; value: string; label: string }[];
  animation: { fadeInDurationMs: number; parallaxStrength: number };
}

export interface AboutSectionData {
  eyebrow: string;
  title: string;
  intro: string;
  statements: { lead: string; body: string }[];
  closing: string;
}

export interface ServiceItem {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  iconName: string;
  accent: string;
  modalDetails: string[];
}

export interface ServicesSectionData {
  eyebrow: string;
  title: string;
  subtitle: string;
  items: ServiceItem[];
}

export interface DigitalResourcesNewsItem {
  id: string;
  title: string;
  date: string;
  source: string;
  summary: string;
  body: string;
}

export interface DigitalResourcesEmergencyItem {
  id: string;
  title: string;
  iconName: string;
  summary: string;
  steps: string[];
}

export interface DigitalResourcesBrandItem {
  name: string;
  url: string;
  domain: string;
}

export interface DigitalResourcesData {
  eyebrow: string;
  title: string;
  subtitle: string;
  tabs: { news: string; emergency: string; brands: string };
  news: { items: DigitalResourcesNewsItem[] };
  emergency: { items: DigitalResourcesEmergencyItem[] };
  brands: { items: DigitalResourcesBrandItem[] };
}
