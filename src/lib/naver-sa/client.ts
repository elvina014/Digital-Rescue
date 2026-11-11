import "server-only";
import { createNaverApi, type NaverApi, type NaverCredentials } from "./core";

/**
 * 네이버 검색광고 API 클라이언트 — 서버 전용 (docs/click-guard/NAVER-API.md).
 * 키는 서버 환경변수에서만 읽는다(NEXT_PUBLIC 금지). "server-only" 때문에 클라이언트 번들에 들어가면 빌드가 실패한다.
 * 서명·타임아웃(8초)·오류 변환은 core.ts 에 있다.
 */
function readCredentials(): NaverCredentials | null {
  const apiKey = process.env.NAVER_SA_API_KEY?.trim();
  const secretKey = process.env.NAVER_SA_SECRET_KEY?.trim();
  const customerId = process.env.NAVER_SA_CUSTOMER_ID?.trim();
  if (!apiKey || !secretKey || !customerId) return null;
  return { apiKey, secretKey, customerId };
}

/** 키가 없으면 호출 시 "네이버 API 키가 설정되지 않았습니다" 오류가 난다 (네이버를 호출하지 않는다) */
export function getNaverApi(): NaverApi {
  return createNaverApi({ credentials: readCredentials(), fetchImpl: (url, init) => fetch(url, init) });
}
