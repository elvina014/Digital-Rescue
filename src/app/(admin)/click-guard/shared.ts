/** 부정클릭 감시 (Click Guard MVP 2/2) — 화면·서버 액션 공용 타입과 라벨 */

export type MarkStatus = "naver_blocked" | "watch" | "normal";

export interface SuspectReason {
  rule: "R1" | "R2" | "R3" | "R4" | "R5" | "CONV";
  label: string;
  value: number;
  points: number;
}

export interface SuspectIp {
  client_ip: string;
  ip_prefix: string;
  score: number;
  reasons: SuspectReason[];
  clicks: number;
  visits: number;
  first_seen: string;
  last_seen: string;
  avg_dwell_ms: number | null;
  total_interactions: number;
  conversions: number;
  mobile_ratio: number;
  top_queries: string[];
  mark_status: MarkStatus | null;
  mark_memo: string | null;
}

/** 네이버 등록 구분: api = ERP가 API로 등록, manual = 검색광고센터에서 직접 등록 */
export type NaverSource = "api" | "manual";

export interface AdSummary {
  visits: number;
  clicks: number;
  ips: number;
  last_collected_at: string | null;
  naver_blocked: number;
}

export interface WhitelistRow {
  id: number;
  cidr: string;
  reason: string | null;
  created_at: string;
}

export interface IpDetailVisit {
  created_at: string;
  session_id: string;
  click_key: string;
  n_query: string | null;
  n_keyword: string | null;
  n_rank: number | null;
  device_type: string | null;
  path: string | null;
  is_bot: boolean;
  dwell_ms: number | null;
  max_scroll_pct: number | null;
  interactions: number | null;
  pageviews: number | null;
  conversions: Record<string, number> | null;
}

export interface IpDetail {
  ip: string;
  ip_prefix: string;
  whitelisted: boolean;
  visits: IpDetailVisit[];
  prefix_clicks: number;
  prefix_ips: number;
  mark: {
    status: MarkStatus;
    memo: string | null;
    marked_at: string;
    updated_at: string;
    marked_by_name: string | null;
  } | null;
}

export const PERIODS = [
  { hours: 24, label: "24시간" },
  { hours: 168, label: "7일" },
  { hours: 720, label: "30일" },
] as const;

export const MIN_SCORES = [40, 60, 80] as const;

/** 네이버 검색광고 광고노출 제한 IP 상한 */
export const NAVER_BLOCK_LIMIT = 600;
export const NAVER_BLOCK_WARN = 500;

export const MARK_LABEL: Record<MarkStatus, string> = {
  naver_blocked: "네이버 등록완료",
  watch: "관찰",
  normal: "정상",
};

export const MARK_BADGE: Record<MarkStatus | "none", string> = {
  naver_blocked: "bg-red-50 text-red-700 border-red-200",
  watch: "bg-amber-50 text-amber-700 border-amber-200",
  normal: "bg-green-50 text-green-700 border-green-200",
  none: "bg-gray-50 text-gray-500 border-gray-200",
};

export const CONVERSION_LABEL: Record<string, string> = {
  phone: "전화",
  kakao: "카톡",
  contact: "접수 버튼",
  form_submit: "접수 완료",
};

/** 마지막 수집이 이 시간보다 오래되면 경고 */
export const STALE_HOURS = 24;

/** 렌더 안에서 Date.now()를 직접 부르지 않도록 분리 (react-hooks purity) */
export function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

/** 모바일 비율이 높거나 같은 대역 집중(R5)이면 공용 IP일 수 있다 */
export function isSharedIpRisk(row: Pick<SuspectIp, "mobile_ratio" | "reasons">): boolean {
  return row.mobile_ratio >= 0.5 || row.reasons.some((r) => r.rule === "R5");
}
