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

/** 재고 상태 */
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

/** 결제 상태 */
export enum PaymentStatus {
  PENDING = "PENDING",
  PAID = "PAID",
}
