import type { Database } from "@/types/supabase";

type Tables = Database["public"]["Tables"];
export type RepairRecordRow = Tables["repair_records"]["Row"];
export type TicketSymptomRow = Tables["ticket_symptoms"]["Row"];
export type MeasurementRow = Tables["repair_measurements"]["Row"];
export type FaultRow = Tables["repair_faults"]["Row"];
export type ActionRow = Tables["repair_actions"]["Row"];
export type RemovedPartRow = Tables["ticket_removed_parts"]["Row"];
export type SymptomCodeRow = Tables["symptom_codes"]["Row"];
export type PartUsedRow = Database["public"]["Views"]["repair_parts_used"]["Row"];

/** 자재 출고 행에서 등록한 적출품 (기존 흐름) — 수리 기록에서는 읽기 전용으로 함께 보여준다 */
export interface MaterialReturnInfo {
  id: string;
  label: string;
  condition: string | null;
  quantity: number;
  status: string | null;
}

export interface RepairRecordData {
  record: RepairRecordRow | null;
  symptoms: TicketSymptomRow[];
  measurements: MeasurementRow[];
  faults: FaultRow[];
  actions: ActionRow[];
  removedParts: RemovedPartRow[];
  symptomCodes: SymptomCodeRow[];
  partsUsed: PartUsedRow[];
  canEdit: boolean;
  gates: { approvalEnabled: boolean; cancelEnabled: boolean; approvalMissing: string[] };
}

export const RESULT_LABEL: Record<string, string> = {
  COMPLETED: "완료",
  PARTIAL: "부분수리",
  UNREPAIRABLE: "수리불가",
  CUSTOMER_ABANDONED: "고객포기",
  SIMPLE_CANCEL: "단순취소",
};
export const CANCEL_RESULTS = ["UNREPAIRABLE", "CUSTOMER_ABANDONED", "SIMPLE_CANCEL"] as const;

export const FAULT_CATEGORY_LABEL: Record<string, string> = {
  MAINBOARD: "메인보드",
  DISPLAY: "디스플레이",
  BATTERY: "배터리",
  POWER: "전원/충전",
  STORAGE: "저장장치",
  MEMORY: "메모리",
  INPUT: "입력장치",
  COOLING: "냉각",
  EXTERIOR: "외관/힌지",
  SOFTWARE: "소프트웨어",
  LIQUID: "침수",
  OTHER: "기타",
  NONE: "이상없음",
};

export const MEASURE_KIND_LABEL: Record<string, string> = {
  VOLTAGE: "전압",
  RESISTANCE: "저항",
  DIODE: "다이오드",
  CURRENT: "전류",
  OTHER: "기타",
};
export const JUDGEMENT_LABEL: Record<string, string> = { NORMAL: "정상", ABNORMAL: "비정상", UNKNOWN: "판단보류" };

export const FAULT_TYPE_LABEL: Record<string, string> = {
  SHORT: "쇼트",
  OPEN: "단선",
  LEAKAGE: "누설",
  NO_OUTPUT: "출력 없음",
  CORROSION: "부식",
  PHYSICAL: "물리적 파손",
  FIRMWARE: "펌웨어",
  OTHER: "기타",
};

export const ACTION_TYPE_LABEL: Record<string, string> = {
  REPLACE: "교체",
  REWORK: "재납땜/리워크",
  CLEAN: "세척",
  FIRMWARE: "펌웨어",
  ADJUST: "조정",
  OTHER: "기타",
};

export const DISPOSITION_LABEL: Record<string, string> = {
  DISCARD: "폐기",
  CUSTOMER_RETURN: "고객반환",
  STOCK: "재고등록",
  DONOR_KEEP: "Donor유지",
};

/** 수리 기록 DB 오류 → 한국어 안내 문구 */
export function repairErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return "알 수 없는 오류가 발생했습니다.";
  switch (error.code) {
    case "P0001":
      return error.message ?? "요청을 처리할 수 없습니다.";
    case "23505":
      return "이미 추가된 항목입니다.";
    case "23503":
      return "사용 중이거나 존재하지 않는 항목입니다.";
    case "23514":
      return "입력값이 올바르지 않습니다. (필수 항목·길이를 확인해 주세요)";
    case "42501":
      return "수정 권한이 없습니다. (승인·취소된 접수건의 수리 기록은 관리자만 수정할 수 있습니다)";
    default:
      return "처리에 실패했습니다: " + (error.message ?? "");
  }
}

export const INPUT_CLASS =
  "rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";
