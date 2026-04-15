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
