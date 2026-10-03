import { EmployeeRole } from "@/types";

/** 라벨 인쇄 · 보관 위치 변경: 관리자·팀장 (입고를 처리하는 역할) */
export const LABEL_MANAGE_ROLES: EmployeeRole[] = [EmployeeRole.ADMIN, EmployeeRole.MANAGER];

/** 한 번에 인쇄할 수 있는 라벨 수 */
export const MAX_PRINT_LABELS = 100;

export const ITEM_CONDITION_LABEL: Record<string, string> = { NEW: "신품", USED: "중고" };

/**
 * 입력값 → 라벨 코드. USB 스캐너가 QR의 URL 전체를 입력해도 마지막 경로만 사용한다.
 * 예) "https://login.example.com/scan/p-00012" → "P-00012"
 */
export function normalizeLabelCode(input: string): string {
  let v = input.trim();
  const idx = v.toLowerCase().lastIndexOf("/scan/");
  if (idx >= 0) v = v.slice(idx + "/scan/".length);
  try {
    v = decodeURIComponent(v);
  } catch {
    // 잘못된 인코딩은 그대로 사용
  }
  return v.split(/[?#/]/)[0].trim().toUpperCase();
}

/** 보관 위치 코드 형식 (DB CHECK와 동일) */
export const LOCATION_CODE_RE = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
