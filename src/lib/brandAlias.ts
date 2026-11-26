/**
 * 브랜드 표기 통합 — 정규화 키(소문자·공백 제거) → 표시 이름.
 * 접수 데이터는 그대로 두고 집계·필터할 때만 묶는다.
 */
export const BRAND_ALIASES: Record<string, string> = {
  삼성: "삼성", 삼성전자: "삼성", samsung: "삼성",
  애플: "애플", apple: "애플",
  마이크로소프트: "마이크로소프트", microsoft: "마이크로소프트", ms: "마이크로소프트",
  서피스: "마이크로소프트", surface: "마이크로소프트", ms서피스: "마이크로소프트", mssurface: "마이크로소프트",
  레노버: "레노버", lenovo: "레노버",
  asus: "ASUS", 아수스: "ASUS", 에이수스: "ASUS",
  lg: "LG", 엘지: "LG", lg전자: "LG",
  hp: "HP",
  델: "델", dell: "델",
  msi: "MSI",
  한성: "한성", 한성컴퓨터: "한성",
  에이서: "에이서", acer: "에이서",
};

/** "MSI[1][5]"처럼 붙은 대괄호 숫자와 공백을 빼고 소문자로 맞춘다 */
export function brandKey(raw: string): string {
  return raw.replace(/\[\d+\]/g, "").replace(/\s+/g, "").toLowerCase();
}

/**
 * 원본 브랜드 표기가 속한 그룹 이름.
 * 별칭에 없으면 정규화 키를 그대로 그룹으로 쓴다. 빈 값이면 null.
 */
export function brandGroup(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = brandKey(raw);
  if (!key) return null;
  return BRAND_ALIASES[key] ?? key;
}
