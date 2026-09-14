/**
 * 날짜 포맷 유틸리티
 * SSR/CSR 환경 차이로 인한 Hydration mismatch 방지를 위해
 * hour12: false (24시간제) + 명시적 timeZone 사용
 */

const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const shortDateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** YYYY. MM. DD. HH:mm 형태 */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

/** MM. DD. HH:mm 형태 (짧은 버전) */
export function formatShortDateTime(iso: string): string {
  return shortDateTimeFmt.format(new Date(iso));
}

/**
 * 기준 시각으로부터 지금까지 지난 일수.
 * 컴포넌트 렌더 안에서 Date.now()를 직접 부르면 순수성 규칙에 걸리므로 이 함수를 쓴다.
 */
export function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
