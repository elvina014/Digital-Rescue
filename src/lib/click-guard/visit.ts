/**
 * Click Guard — 광고 유입 1건의 파생 값 (click_key, 봇 판정, 기기 종류)
 *
 * 다른 모듈을 import 하지 않는다 — 단위 테스트(tests/click-guard)가 Node에서 직접 불러온다.
 */

/** 새로고침 중복을 묶는 단위: 10분 */
export const CLICK_BUCKET_MS = 10 * 60 * 1000;

/**
 * click_key: NaPm(클릭마다 네이버가 새로 발급)이 있으면 그 원문,
 * 없으면 세션 + 광고 소재(n_ad) + 10분 버킷. 원본 행은 전부 저장하고 집계는 distinct click_key로 한다.
 */
export function buildClickKey(input: {
  napm: string | null | undefined;
  sessionId: string;
  nAd: string | null | undefined;
  nowMs: number;
}): string {
  const napm = input.napm?.trim();
  if (napm) return napm;
  const bucket = Math.floor(input.nowMs / CLICK_BUCKET_MS);
  return `sid:${input.sessionId}|ad:${input.nAd?.trim() ?? ""}|b:${bucket}`;
}

const BOT_UA = /bot|crawler|spider|Yeti|HeadlessChrome|Lighthouse/i;

/** 봇 UA는 버리지 않고 is_bot=true 로 저장한다 */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  return !!ua && BOT_UA.test(ua);
}

export function deviceTypeOf(ua: string | null | undefined): "mobile" | "tablet" | "desktop" {
  if (!ua) return "desktop";
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return "tablet";
  if (/Mobi|iPhone|iPod|Android/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * 사람이 연 페이지(문서 요청)인지. 운영 빌드에서 Next.js는 광고 페이지를 연 뒤 같은 주소로 화면 데이터(RSC)를
 * 다시 요청하는데, _rsc·RSC 헤더를 proxy 전에 지워 광고 유입처럼 보인다. 브라우저가 붙이는 Sec-Fetch-Dest는
 * 남으므로 그 값이 document 가 아니면 기록하지 않는다. 헤더가 없는 클라이언트(구형 브라우저·일부 봇)는 기록한다.
 */
export function isDocumentRequest(secFetchDest: string | null | undefined): boolean {
  return !secFetchDest || secFetchDest.toLowerCase() === "document";
}
