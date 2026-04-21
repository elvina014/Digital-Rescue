// ===== 데이터베이스 테이블 타입 정의 =====
// 01_db_schema.md 기반

import {
  EmployeeRole,
  InventoryCondition,
  ItemCondition,
  PaymentStatus,
  ReceiptType,
  TicketStatus,
  DeviceType,
  MaterialRequestStatus,
} from "./enums";

/** 직원 테이블 (employees) - Supabase Auth와 1:1 매핑 */
export interface Employee {
  id: string; // UUID, auth.users.id FK
  name: string;
  role: EmployeeRole;
  phone: string | null;
  created_at: string; // ISO 8601
}

/** 고객 테이블 (customers) */
export interface Customer {
  id: string; // UUID
  name: string;
  phone: string;
  address: string | null;
  created_at: string;
}

/** 수리 접수건 테이블 (repair_tickets) - 핵심 테이블 */
export interface RepairTicket {
  id: string; // UUID
  customer_id: string; // FK → customers.id
  assignee_id: string | null; // FK → employees.id
  status: TicketStatus;
  receipt_type: ReceiptType;
  device_type: DeviceType;
  device_brand: string;
  device_model: string | null;
  symptoms: string;
  /** 시스템 산출 최소 견적 (감가상각 반영) */
  initial_estimate: number;
  /** 예상 견적 (기사가 고객과 조율한 수리 예상 금액) */
  expected_estimate: number;
  /** 자재비 (수리에 사용된 부품 구매 금액) */
  material_cost: number;
  /** 자재비 상세 내역 (비용내용, 금액의 배열) */
  material_cost_details: { description: string; amount: number }[];
  /** 최종 확정 견적 (담당자 입력) */
  final_price: number;
  /** 회사(팀장/관리자) 최종 승인 여부 */
  is_approved: boolean;
  payment_status: PaymentStatus;
  /** 결제 방식 (CARD, BANK_TRANSFER, E_PAYMENT) */
  payment_method: string | null;
  /** 가치평가금액 */
  evaluated_value: number;
  /** 최소견적금액 */
  minimum_estimate: number;
  /** 확정예상견적 */
  confirmed_estimate: number;
  created_at: string;
  updated_at: string;
}

/** 모델별 견적 DB 테이블 (device_models) */
export interface DeviceModel {
  id: string; // UUID
  brand: string;
  model_name: string;
  release_year: number;
  release_price: number;
  /** 주요 사양 (CPU, RAM 등) - JSONB */
  specs: Record<string, unknown> | null;
  /** 기본 최소 수리 비용 */
  min_repair_cost: number;
}

/** 재고 관리 테이블 (inventory) — 레거시 */
export interface LegacyInventoryItem {
  id: string; // UUID
  part_name: string;
  condition: InventoryCondition;
  quantity: number;
  /** 매입/원가 */
  cost_price: number;
  created_at: string;
}

/** 재고 카테고리 참조 테이블 (inventory_categories) */
export interface InventoryCategory {
  id: string; // UUID
  name: string;
  created_at: string;
}

/** 재고 스펙 참조 테이블 (inventory_specs) */
export interface InventorySpec {
  id: string; // UUID
  category_id: string; // FK → inventory_categories.id
  name: string;
  created_at: string;
}

/** 재고 제품 참조 테이블 (inventory_products) */
export interface InventoryProduct {
  id: string; // UUID
  spec_id: string; // FK → inventory_specs.id
  name: string;
  created_at: string;
}

/** 재고 아이템 마스터 (inventory_items) */
export interface InventoryItem {
  id: string; // UUID
  category_id: string; // FK → inventory_categories.id
  spec_id: string; // FK → inventory_specs.id
  product_id: string; // FK → inventory_products.id
  /** 용량/인치수 (예: '8GB', '15.6"') */
  capacity: string | null;
  condition: ItemCondition;
  quantity: number;
  /** 기초견적 금액 (원) */
  base_estimate: number;
  created_at: string;
  updated_at: string;
}

/** 처리 현황 및 로그 테이블 (ticket_logs) - 타임라인 역할 */
export interface TicketLog {
  id: string; // UUID
  ticket_id: string; // FK → repair_tickets.id
  employee_id: string; // FK → employees.id
  message: string;
  created_at: string;
}

/** 시스템 전역 설정 (global_settings) — 단일 row */
export interface GlobalSettings {
  /** 기본 서비스 비용 (원) */
  base_service_cost: number;
  /** 가치 기준 금액 (원) */
  value_reference_amount: number;
  /** 할인/할증 비율 (%, 기본 100) */
  discount_surcharge_rate: number;
  updated_at: string;
}

/** 수리건별 사용 재고 (ticket_materials) */
export interface TicketMaterial {
  id: string; // UUID
  ticket_id: string; // FK → repair_tickets.id
  inventory_item_id: string; // FK → inventory_items.id
  quantity: number;
  request_status: MaterialRequestStatus;
  notes: string | null;
  created_by: string | null; // FK → employees.id
  is_return_registered: boolean;
  return_category_id: string | null;
  return_spec: string | null;
  return_name: string | null;
  return_condition: "중고품" | "불량품" | null;
  return_status: "pending" | "approved" | "rejected" | null;
  created_at: string;
  updated_at: string;
}
