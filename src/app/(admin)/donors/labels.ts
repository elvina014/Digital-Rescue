/** Donor 기기 화면 공용 라벨·타입 */

export const DONOR_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "보관중",
  DEPLETED: "적출 완료",
  SCRAPPED: "폐기",
};

export const CANDIDATE_STATUS_LABEL: Record<string, string> = {
  AVAILABLE: "적출 가능",
  REQUESTED: "입고 요청",
  EXTRACTED: "입고 완료",
  UNUSABLE: "사용 불가",
};

export const CONDITION_LABEL: Record<string, string> = {
  GOOD: "양호",
  UNTESTED: "미확인",
  FAULTY: "불량",
};

export const CONSENT_TEXT = "고객이 기기 소유권 포기(폐기 위임)에 동의했음을 확인했습니다.";

export const PII_HINT = "고객 이름·연락처 등 개인정보는 지우고 저장하세요.";

/** 적출 입고 시 기존 재고 분류로 들어갈 값 (적출품 등록과 같은 입력) */
export interface InboundInput {
  categoryId: string | null;
  returnSpec: string;
  returnName: string;
  returnCapacity: string;
}

export interface CandidateRow {
  id: string;
  description: string;
  quantity: number;
  condition_estimate: string;
  status: string;
  note: string | null;
  part_spec_id: string | null;
  partSpecLabel: string | null;
  category_id: string | null;
  categoryName: string | null;
  return_spec: string | null;
  return_name: string | null;
  return_capacity: string | null;
  extracted_at: string | null;
  inventory_item_id: string | null;
}

export const DONOR_EDIT_ROLES = ["ADMIN", "MANAGER"];
export const DONOR_STAFF_ROLES = ["ADMIN", "MANAGER", "TECHNICIAN", "EXPERT_REPAIR"];
