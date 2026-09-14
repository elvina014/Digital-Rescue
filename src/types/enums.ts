// ===== 공통 Enum (열거형) 타입 정의 =====
// 01_db_schema.md 기반

/** 직원 권한 등급 */
export enum EmployeeRole {
  /** 관리자 (모든 권한) */
  ADMIN = "ADMIN",
  /** 팀장 (승인, 분쟁 조정, 전체 진행 관리) */
  MANAGER = "MANAGER",
  /** 접수처 (신규 접수, 담당기사 배정) */
  RECEPTION = "RECEPTION",
  /** 담당기사 (견적 산출, 고객 응대, 자재비 승인 요청) */
  TECHNICIAN = "TECHNICIAN",
  /** 정밀수리팀 (복잡한 수리, 외주 관리) */
  EXPERT_REPAIR = "EXPERT_REPAIR",
  /** 고객 서비스 (사후 관리, 불편 접수) */
  CS = "CS",
}

/** 접수건 처리 상태 */
export enum TicketStatus {
  /** 신규 접수 (담당자 미배정) */
  NEW = "NEW",
  /** 담당자 배정 완료 (1차 상담 대기) */
  ASSIGNED = "ASSIGNED",
  /** 제품 입고 완료 (실물 입고 후 수리 시작 대기) */
  RECEIVED = "RECEIVED",
  /** 수리/점검 진행 중 */
  IN_PROGRESS = "IN_PROGRESS",
  /** 자재비 및 견적 회사 승인 대기 */
  WAITING_APPROVAL = "WAITING_APPROVAL",
  /** 수리 완료 (결제 완료 및 출고) */
  COMPLETED = "COMPLETED",
  /** 수리 취소 (반출) */
  CANCELED = "CANCELED",
}

/** 접수 방식 */
export enum ReceiptType {
  /** 내방 서비스 */
  WALK_IN = "WALK_IN",
  /** 방문 서비스 */
  VISIT = "VISIT",
  /** 퀵 서비스 */
  QUICK = "QUICK",
  /** 택배 서비스 */
  PARCEL = "PARCEL",
}

/** 재고 상태 (레거시 — 기존 inventory 테이블용) */
export enum InventoryCondition {
  /** 신품 */
  NEW = "NEW",
  /** 양품 (중고 A급) */
  GOOD = "GOOD",
  /** 불량품 */
  DEFECTIVE = "DEFECTIVE",
  /** 잉여 부품 (중고 B/C급) */
  SURPLUS = "SURPLUS",
}

/** 재고 아이템 상태 */
export enum ItemCondition {
  /** 신품 */
  NEW = "NEW",
  /** 중고품 */
  USED = "USED",
}

/** 결제 상태 */
export enum PaymentStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  /** 일부 금액 환불됨 */
  PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED",
  /** 전액 환불됨 (거래 종결) */
  REFUNDED = "REFUNDED",
}

/** 기기 유형 */
export enum DeviceType {
  NOTEBOOK = "노트북",
  DESKTOP = "데스크탑",
  TABLET = "태블릿",
  SERVER = "서버",
  NAS = "나스",
  OTHER_STORAGE = "기타저장장치",
}

/** 자재 요청 상태 */
export enum MaterialRequestStatus {
  PENDING = "pending",
  REQUESTED = "requested",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCEL_REQUESTED = "cancel_requested",
  CANCELLED = "cancelled",
}

/** 환불 사유 코드 */
export enum RefundReason {
  /** 수리 품질 하자 · 증상 재발 (회사 귀책) */
  QUALITY = "QUALITY",
  /** 수리 실패 · 원상복구 (회사 귀책) */
  REPAIR_FAILED = "REPAIR_FAILED",
  /** 과다 · 오청구 (회사 귀책) */
  OVERCHARGE = "OVERCHARGE",
  /** 중복 결제 (회사 귀책) */
  DUPLICATE = "DUPLICATE",
  /** 고객 불만 · 응대 문제 (협의) */
  COMPLAINT = "COMPLAINT",
  /** 고객 단순 변심 (고객 귀책) */
  CHANGE_MIND = "CHANGE_MIND",
  /** 기타 (상세 사유 필수) */
  OTHER = "OTHER",
}

/** 환불 실행 방법 */
export enum RefundMethod {
  /** 카드 승인취소 (전액) */
  CARD_CANCEL = "CARD_CANCEL",
  /** 카드 부분취소 */
  CARD_PARTIAL_CANCEL = "CARD_PARTIAL_CANCEL",
  /** 계좌 송금 */
  BANK_REFUND = "BANK_REFUND",
  /** 현금 반환 */
  CASH = "CASH",
}

/** 환불 처리 단계 */
export enum RefundStatus {
  /** 요청됨 (CS · 팀장 · 관리자) */
  REQUESTED = "REQUESTED",
  /** 승인됨 (팀장 · 관리자) */
  APPROVED = "APPROVED",
  /** 완료됨 — 이 시점에만 매출에서 차감된다 */
  COMPLETED = "COMPLETED",
  /** 반려됨 */
  REJECTED = "REJECTED",
  /** 무효처리 (오등록 정정, 관리자 전용) */
  VOID = "VOID",
}

/** 환불 시 부품 회수 여부 */
export enum PartsRecovery {
  /** 회수함 — 적출품 등록 프로세스로 재고 복구 */
  RECOVERED = "RECOVERED",
  /** 회수 안 함 — 자재비 공제 또는 손실 처리 */
  NOT_RECOVERED = "NOT_RECOVERED",
  /** 해당 없음 — 회수 대상 부품이 없는 건 */
  NONE = "NONE",
}
