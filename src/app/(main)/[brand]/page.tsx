import { notFound } from "next/navigation";
import mainData from "@/data/mainPageData.json";
import brandData from "@/data/brandLandingData.json";
import { findBrandRoute, BRAND_ROUTES } from "@/lib/brands";
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

export default async function BrandPage({ params }: BrandPageProps) {
  const { brand } = await params;
  const route = findBrandRoute(brand);

  // generateStaticParams + dynamicParams=false 로 이미 보장되지만
  // 타입 좁히기 + 안전망 차원에서 한 번 더 확인.
  if (!route) notFound();

  const entry = (brandData.brands as Record<string, unknown>)[route.slug];
  if (!entry) notFound();

  const intro = (entry as { intro: BrandIntroData }).intro;

  return (
    <>
      {/* 섹션 1: 서비스 및 회사 소개 (브랜드 전용, 화려한 인터랙션) */}
      <BrandIntroSection
        data={intro}
        theme={mainData.theme as ThemeData}
        displayName={route.displayName}
      />

      {/* 섹션 2: 다양한 고장 증상들 (메인페이지 공통) */}
      <SymptomsSection
        data={mainData.symptoms as SymptomsSectionData}
        theme={mainData.theme as ThemeData}
      />

      {/* 섹션 3: 서비스 과정 안내 (메인페이지 공통) */}
      <ProcessSection
        data={mainData.process as ProcessSectionData}
        theme={mainData.theme as ThemeData}
      />

      {/* 섹션 4: 온라인 서비스 접수 (메인페이지 공통, URL 기반 브랜드 자동 주입) */}
      <ContactForm
        data={mainData.contactForm as ContactFormData}
        theme={mainData.theme as ThemeData}
        defaultBrand={route.formBrandValue}
        defaultDeviceType={route.formDeviceType}
      />

      {/* 섹션 5: 실시간 수리 현황 (현황 유지) */}
      <RealtimeStatus
        data={mainData.realtimeStatus as RealtimeStatusData}
        theme={mainData.theme as ThemeData}
      />
    </>
  );
}
