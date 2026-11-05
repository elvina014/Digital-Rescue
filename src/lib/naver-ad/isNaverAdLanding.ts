/**
 * 네이버 검색광고(파워링크) 유입 판정 — Click Guard 공용 (docs/click-guard/SPEC.md)
 *
 * 광고 클릭으로 들어오면 랜딩 URL에 네이버가 붙이는 파라미터 중 하나라도 있으면 광고 유입으로 본다.
 * 기존 CTA 계측(src/lib/ctaTracking.ts rememberLanding)의 판정은 아직 이 함수로 바꾸지 않았다(후속).
 *
 * 다른 모듈을 import 하지 않는다 — 단위 테스트(tests/click-guard)가 Node에서 직접 불러온다.
 */
export const NAVER_AD_PARAM_KEYS = ["NaPm", "n_media", "n_ad", "n_keyword", "n_campaign_type"] as const;

export function isNaverAdLanding(searchParams: { has(name: string): boolean }): boolean {
  return NAVER_AD_PARAM_KEYS.some((key) => searchParams.has(key));
}
