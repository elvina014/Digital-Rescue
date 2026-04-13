// ===== 데이터베이스 테이블 타입 정의 =====
// 01_db_schema.md 기반

import {
  EmployeeRole,
  InventoryCondition,
  PaymentStatus,
  ReceiptType,
  TicketStatus,
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
  device_brand: string;
  device_model: string | null;
  symptoms: string;
  /** 시스템 산출 최소 견적 (감가상각 반영) */
  initial_estimate: number;
  /** 최종 확정 견적 (담당자 입력) */
  final_price: number;
  /** 회사(팀장/관리자) 최종 승인 여부 */
  is_approved: boolean;
  payment_status: PaymentStatus;
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

/** 재고 관리 테이블 (inventory) */
export interface InventoryItem {
  id: string; // UUID
  part_name: string;
  condition: InventoryCondition;
  quantity: number;
  /** 매입/원가 */
  cost_price: number;
  created_at: string;
}

/** 처리 현황 및 로그 테이블 (ticket_logs) - 타임라인 역할 */
export interface TicketLog {
  id: string; // UUID
  ticket_id: string; // FK → repair_tickets.id
  employee_id: string; // FK → employees.id
  message: string;
  created_at: string;
}
