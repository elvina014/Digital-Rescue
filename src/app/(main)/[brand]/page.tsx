import { notFound } from "next/navigation";
import { findBrandRoute, BRAND_ROUTES } from "@/lib/brands";
import { getPageSections } from "@/lib/pageContents";
import { BrandIntroSection } from "@/components/brand/BrandIntroSection";
import { SymptomsSection } from "@/components/common/SymptomsSection";
import { ProcessSection } from "@/components/common/ProcessSection";
import { ContactForm } from "@/components/common/ContactForm";
import { RealtimeStatus } from "@/components/common/RealtimeStatus";
import type {
  BrandIntroData,
  ContactFormData,
  ProcessSectionData,
  RealtimeStatusData,
  SymptomsSectionData,
  ThemeData,
} from "@/types/sections";

/**
 * 정적으로 허용된 14개의 브랜드 슬러그만 빌드 시점에 생성한다.
 * dynamicParams = false 와 함께 사용해 그 외 슬러그는 모두 404 처리된다.
 * 슬러그 정의는 src/lib/brands.ts 의 BRAND_ROUTES 가 단일 출처.
 */
export async function generateStaticParams() {
  return BRAND_ROUTES.map((b) => ({ brand: b.slug }));
}

export const dynamicParams = false;

interface BrandPageProps {
  params: Promise<{ brand: string }>;
}

/**
 * 브랜드 랜딩 페이지
 *
 * 데이터 소스:
 *   - 섹션 1 (Brand Intro): page_contents 의 brand:{slug} / intro 행
 *   - 섹션 2~5 (공통 섹션): page_contents 의 main 페이지 행 — 메인페이지와 동일
 *   - theme: main 페이지 행
 *
 * 두 페이지(main, brand:{slug}) 데이터를 병렬로 페치 후 컴포넌트에 분배.
 * 어떤 행이든 누락 시 컴포넌트의 defaultProps 폴백.
 */
export default async function BrandPage({ params }: BrandPageProps) {
  const { brand } = await params;
  const route = findBrandRoute(brand);

  if (!route) notFound();

  const [main, brandData] = await Promise.all([
    getPageSections("main"),
    getPageSections(`brand:${route.slug}`),
  ]);

  const theme = main.theme as ThemeData | undefined;
  const intro = brandData.intro as BrandIntroData | undefined;

  return (
    <>
      {/* 섹션 1: 서비스 및 회사 소개 (브랜드 전용) */}
      <BrandIntroSection
        data={intro}
        theme={theme}
        displayName={route.displayName}
      />

      {/* 섹션 2: 다양한 고장 증상들 (메인페이지 공통) */}
      <SymptomsSection
        data={main.symptoms as SymptomsSectionData | undefined}
        theme={theme}
      />

      {/* 섹션 3: 서비스 과정 안내 (메인페이지 공통) */}
      <ProcessSection
        data={main.process as ProcessSectionData | undefined}
        theme={theme}
      />

      {/* 섹션 4: 온라인 서비스 접수 (메인페이지 공통, URL 기반 브랜드 자동 주입) */}
      <ContactForm
        data={main.contactForm as ContactFormData | undefined}
        theme={theme}
        defaultBrand={route.formBrandValue}
        defaultDeviceType={route.formDeviceType}
      />

      {/* 섹션 5: 실시간 수리 현황 (현황 유지) */}
      <RealtimeStatus
        data={main.realtimeStatus as RealtimeStatusData | undefined}
        theme={theme}
      />
    </>
  );
}
