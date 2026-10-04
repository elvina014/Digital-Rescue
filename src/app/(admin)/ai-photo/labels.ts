/** AI 사진 인식 (Phase 9) 공용 라벨·타입 */

export type PhotoKind = "PART" | "BOARD" | "DEVICE";

/** 업로드 가능 역할 (D4). 검토는 관리자만 (기기 마스터 → AI 후보) */
export const AI_PHOTO_ROLES = ["ADMIN", "MANAGER", "TECHNICIAN", "EXPERT_REPAIR"];

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  PART: "부품 라벨·칩 마킹",
  BOARD: "메인보드 번호",
  DEVICE: "기기 라벨",
};

export const SKIP_REASON_LABEL: Record<string, string> = {
  ALREADY: "이미 등록됨",
  CONFLICT: "다른 대상의 별칭·번호",
  PII: "개인정보로 보여 제외",
  UNREADABLE: "읽을 수 없음",
  REPEATED: "같은 사진에서 중복",
  TOO_LONG: "보드 별칭은 100자 이내",
};

export interface RecognitionResult {
  requestId: string | null;
  created: { candidateId: string; alias: string; duplicate: boolean }[];
  skipped: { text: string; reason: string; detail: string | null }[];
}
