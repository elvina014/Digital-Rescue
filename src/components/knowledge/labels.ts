/** 부품·기기 검색 / 접수 사전 확인 (Phase 5) — 표시 문구와 화면 권한 */

export const NOTE_TYPE_LABEL: Record<string, string> = {
  CAUTION: "주의",
  KNOWN_ISSUE: "고질 고장",
  TIP: "작업 팁",
  PARTS: "부품 정보",
};

export const NOTE_TYPE_CLASS: Record<string, string> = {
  CAUTION: "bg-red-100 text-red-700",
  KNOWN_ISSUE: "bg-amber-100 text-amber-800",
  TIP: "bg-blue-100 text-blue-800",
  PARTS: "bg-teal-100 text-teal-800",
};

export const TICKET_STATUS_LABEL: Record<string, string> = {
  NEW: "신규",
  ASSIGNED: "배정",
  RECEIVED: "입고",
  IN_PROGRESS: "수리 중",
  WAITING_APPROVAL: "승인 대기",
  COMPLETED: "완료",
  CANCELED: "취소",
};

export const CASE_STATUS_LABEL: Record<string, string> = { COMPLETED: "완료", CANCELED: "취소", OPEN: "진행 중" };

/** 메모 작성 가능 (DB: model_notes_insert) */
export const NOTE_WRITER_ROLES = ["ADMIN", "MANAGER", "TECHNICIAN", "EXPERT_REPAIR"];
/** 모든 접수건을 열 수 있는 직급 (tickets_select) — 사례 링크 표시 */
export const TICKET_LINK_ROLES = ["ADMIN", "MANAGER", "RECEPTION"];

export const NOTE_MAX = 1000;
