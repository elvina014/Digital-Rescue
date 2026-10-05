/** 구매 요청 확인(Phase 6) — 사유·자원 한국어 라벨 */

export const REASON_CODES = ["INTERNAL_DEFECTIVE", "CUSTOMER_NEW", "DONOR_UNVERIFIED", "LEAD_TIME", "OTHER"] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const REASON_LABELS: Record<ReasonCode, string> = {
  INTERNAL_DEFECTIVE: "내부재고 불량",
  CUSTOMER_NEW: "고객 신품요청",
  DONOR_UNVERIFIED: "Donor 상태 미확인",
  LEAD_TIME: "납기",
  OTHER: "기타",
};

export const SOURCE_LABELS: Record<string, string> = {
  STOCK_SAME_ITEM: "같은 재고 입고됨",
  STOCK_SAME_PRODUCT: "같은 제품·용량 재고",
  STOCK_SAME_SPEC: "같은 부품 규격 재고",
  STOCK_COMPATIBLE: "호환 확인된 규격 재고",
  DONOR_SAME_SPEC: "Donor · 같은/호환 규격",
  DONOR_SAME_DEVICE: "Donor · 같은 기기",
};

export const CONDITION_LABELS: Record<string, string> = {
  NEW: "신품",
  USED: "중고",
  GOOD: "양호",
  UNTESTED: "미확인",
  FAULTY: "불량",
};

export const NOTE_MAX = 500;

export function isDonorSource(source: string) {
  return source.startsWith("DONOR_");
}

export function reasonLabel(code: string | null) {
  return code ? (REASON_LABELS[code as ReasonCode] ?? code) : "—";
}
