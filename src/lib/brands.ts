/**
 * 브랜드별 랜딩페이지 라우팅을 위한 단일 출처(Single Source of Truth).
 * - 슬러그(slug)는 소문자 케이스가 정규(canonical) 형태이며, 정적 페이지는 이 형태로만 빌드된다.
 * - 사용자가 /Lenovo, /SAMSUNG 같이 다른 케이스로 접근하면 src/proxy.ts 에서 소문자 정규 형태로
 *   308 리다이렉트된다 (canonicalBrandSlug 사용).
 * - 14개 외 슬러그는 [brand]/page.tsx 에서 notFound() 처리된다.
 * - CMS(edit.digital-rescue.com) 에서 displayName 등 표시용 텍스트는
 *   src/data/brandLandingData.json 의 brands[slug] 항목으로 덮어쓴다.
 */
export interface BrandRoute {
  slug: string;
  displayName: string;
  formBrandValue: string | null;
  formDeviceType: string | null;
}

export const BRAND_ROUTES: readonly BrandRoute[] = [
  { slug: "samsung", displayName: "삼성",    formBrandValue: "삼성",    formDeviceType: null },
  { slug: "dell",    displayName: "델",      formBrandValue: "델",      formDeviceType: null },
  { slug: "lg",      displayName: "LG",      formBrandValue: "LG",      formDeviceType: null },
  { slug: "surface", displayName: "Surface", formBrandValue: "Surface", formDeviceType: null },
  { slug: "apple",   displayName: "애플",    formBrandValue: "애플",    formDeviceType: null },
  { slug: "acer",    displayName: "에이서",  formBrandValue: "에이서",  formDeviceType: null },
  { slug: "hp",      displayName: "HP",      formBrandValue: "HP",      formDeviceType: null },
  { slug: "asus",    displayName: "ASUS",    formBrandValue: "ASUS",    formDeviceType: null },
  { slug: "msi",     displayName: "MSI",     formBrandValue: "MSI",     formDeviceType: null },
  { slug: "hansung", displayName: "한성",    formBrandValue: "한성",    formDeviceType: null },
  { slug: "lenovo",  displayName: "레노버",  formBrandValue: "레노버",  formDeviceType: null },
  { slug: "sandisk", displayName: "SanDisk", formBrandValue: "SanDisk", formDeviceType: "기타저장장치" },
  { slug: "razer",   displayName: "Razer",   formBrandValue: "Razer",   formDeviceType: null },
  { slug: "nas",     displayName: "NAS",     formBrandValue: null,      formDeviceType: "나스" },
] as const;

export const VALID_BRAND_SLUGS: readonly string[] = BRAND_ROUTES.map((b) => b.slug);

/**
 * 임의 케이스로 들어온 입력을 정규(소문자) 슬러그로 변환한다.
 * 14개 브랜드 중 어느 것과도 매치되지 않으면 null.
 *   canonicalBrandSlug("Lenovo") === "lenovo"
 *   canonicalBrandSlug("SAMSUNG") === "samsung"
 *   canonicalBrandSlug("HP")     === "hp"
 *   canonicalBrandSlug("foo")    === null
 */
export function canonicalBrandSlug(input: string): string | null {
  const lower = input.toLowerCase();
  return VALID_BRAND_SLUGS.includes(lower) ? lower : null;
}

export function findBrandRoute(slug: string): BrandRoute | undefined {
  const canonical = canonicalBrandSlug(slug);
  if (!canonical) return undefined;
  return BRAND_ROUTES.find((b) => b.slug === canonical);
}
