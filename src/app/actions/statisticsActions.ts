"use server";

import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { kstMonthStart, kstParts } from "@/lib/date";

// ─── 접근 확인 (로그인 + ADMIN/MANAGER) ───────────────────────
export type StatsResult<T> = { data: T } | { error: string };

async function requireStatsAccess(): Promise<string | null> {
  const employee = await getCurrentEmployee();
  if (!employee) return "로그인이 필요합니다. 다시 로그인해 주세요.";
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return "통계 조회 권한이 없습니다. (ADMIN/MANAGER만 가능)";
  }
  return null;
}

// ─── 공통 날짜 헬퍼 (한국시간 기준 경계) ─────────────────────
function yearRange(year: number) {
  return {
    start: kstMonthStart(year, 1).toISOString(),
    end:   kstMonthStart(year + 1, 1).toISOString(),
  };
}
function monthRange(year: number, month: number) {
  return {
    start: kstMonthStart(year, month).toISOString(),
    end:   kstMonthStart(year, month + 1).toISOString(),
  };
}

/**
 * 접수건의 실매출 = 최종 견적 − 누적 환불액.
 * 환불은 원 매출이 잡힌 월(completed_at)에서 차감된다.
 */
function netRevenue(t: { final_price: number | null; refunded_amount?: number | null }): number {
  return (t.final_price ?? 0) - (t.refunded_amount ?? 0);
}

/**
 * 접수건의 순매출 = 실매출 − 자재비(material_cost: 재고 자재 + 수동 추가 비용).
 * 완료 후 추가된 비용(A/S·누락 비용)도 material_cost에 합산되므로 원래 완료월에서 차감된다.
 */
function netProfit(t: { final_price: number | null; refunded_amount?: number | null; material_cost?: number | null }): number {
  return netRevenue(t) - (t.material_cost ?? 0);
}

// ─── 타입 정의 ────────────────────────────────────────────────

export interface MonthlyRevenueData {
  month: number;
  label: string;
  revenue: number;
  /** 자재비 합계 (재고 자재 + 수동 추가 비용) */
  cost: number;
  /** 순매출 = 실매출 − 자재비 */
  profit: number;
  /** 순매출 중 계좌이체 + 증빙(현금영수증·세금계산서) 미발급 */
  unissued: number;
  /** 순매출 중 계좌이체 + 증빙 발급 여부 미기록 (기능 도입 이전 건) */
  unknown: number;
  /** 순매출 중 나머지 (과세대상) */
  taxable: number;
}

export interface DailyIntakeData {
  day: number;
  label: string;
  count: number;
}

export interface ReceiveRate {
  /** 접수 건수 (created_at 기준) */
  total: number;
  /** 그중 입고된 건수 (received_at 있음 — 이후 취소 건 포함) */
  received: number;
  /** 입고율 % */
  rate: number;
}

export interface IntakeStatsData {
  daily: DailyIntakeData[];
  annual: ReceiveRate;
  monthly: ReceiveRate;
}

export interface TechnicianRevenueData {
  technicianId: string;
  name: string;
  revenue: number;
  count: number;
}

export interface TechnicianPerformanceData {
  technicianId: string;
  name: string;
  completedCount: number;
  totalRevenue: number;
  /** 자재비 합계 (재고 자재 + 수동 추가 비용) */
  totalCost: number;
  /** 순매출 = 실매출 − 자재비 */
  netProfit: number;
  upsellAmount: number;
  upsellCount: number;
}

export interface BrandBreakdownData {
  brand: string;
  count: number;
}

export interface StatusBreakdownData {
  status: string;
  label: string;
  count: number;
  color: string;
}

export interface ReceiptTypeBreakdownData {
  receiptType: string;
  label: string;
  count: number;
}

export interface TechCancelData {
  technicianId: string;
  name: string;
  /** 선택 월 */
  totalCount: number;
  canceledCount: number;
  cancelRate: number;
  /** 당월 */
  monthlyTotal: number;
  monthlyCanceled: number;
  monthlyCancelRate: number;
}

export interface CancelStatsData {
  /** 선택 월 취소 건수 */
  totalCanceled: number;
  /** 선택 월 전체 취소율 % (전체 접수 대비) */
  totalRate: number;
  /** 당월 취소 건수 (canceled_at 기준) */
  monthlyCanceled: number;
  /** 당월 취소율 % (당월 접수 대비) */
  monthlyRate: number;
  /** 선택 월 입고 전 취소 건수 (received_at 없음) */
  preReceiptCanceled: number;
  /** 입고 전 취소율 % = 입고 전 취소 ÷ 전체 접수 */
  preReceiptRate: number;
  /** 선택 월 입고 후 취소 건수 (received_at 있음) */
  postReceiptCanceled: number;
  /** 입고 후 취소율 % = 입고 후 취소 ÷ 입고 완료 건수 */
  postReceiptRate: number;
  /** 선택 월 접수 중 입고 완료된 건수 (입고 후 취소율 분모) */
  receivedCount: number;
  /** 담당기사별 취소율 */
  byTechnician: TechCancelData[];
}

const STATUS_LABEL_MAP: Record<string, { label: string; color: string }> = {
  NEW:              { label: "신규접수",  color: "#3b82f6" },
  ASSIGNED:         { label: "기사배정",  color: "#8b5cf6" },
  RECEIVED:         { label: "입고완료",  color: "#14b8a6" },
  IN_PROGRESS:      { label: "수리중",    color: "#f59e0b" },
  WAITING_APPROVAL: { label: "승인대기",  color: "#f97316" },
  COMPLETED:        { label: "수리완료",  color: "#10b981" },
  CANCELED:         { label: "취소",      color: "#6b7280" },
};

const RECEIPT_LABEL_MAP: Record<string, string> = {
  WALK_IN: "내방",
  VISIT:   "방문",
  QUICK:   "퀵",
  PARCEL:  "택배",
};

// ─── 매출 관련 함수 ───────────────────────────────────────────

/**
 * 선택 연도 기준 월별 매출 집계 — completed_at 기준
 */
export async function getAnnualRevenue(year: number): Promise<StatsResult<MonthlyRevenueData[]>> {
  const denied = await requireStatsAccess();
  if (denied) return { error: denied };

  const supabase = await createClient();
  const { start } = yearRange(year);

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, refunded_amount, material_cost, completed_at, payment_method, cash_receipt_issued")
    .eq("is_test", false)
    .eq("status", "COMPLETED")
    .gte("completed_at", start) as unknown as { data: { final_price: number | null; refunded_amount: number | null; material_cost: number | null; completed_at: string | null; payment_method: string | null; cash_receipt_issued: boolean | null }[] | null };

  type MonthAcc = { revenue: number; cost: number; unissued: number; unknown: number; taxable: number };
  const monthMap: Record<number, MonthAcc> = {};
  for (const t of data ?? []) {
    if (!t.completed_at) continue;
    const { year: y, month: m } = kstParts(t.completed_at);
    // 해당 연도 데이터만 포함
    if (y !== year) continue;
    if (!monthMap[m]) monthMap[m] = { revenue: 0, cost: 0, unissued: 0, unknown: 0, taxable: 0 };
    monthMap[m].revenue += netRevenue(t);
    monthMap[m].cost += t.material_cost ?? 0;
    // 계좌이체 건만 증빙(현금영수증·세금계산서) 발급 여부로 과세 구분한다. 카드·간편결제는 과세대상.
    const profit = netProfit(t);
    if (t.payment_method === "BANK_TRANSFER" && t.cash_receipt_issued === false) monthMap[m].unissued += profit;
    else if (t.payment_method === "BANK_TRANSFER" && t.cash_receipt_issued === null) monthMap[m].unknown += profit;
    else monthMap[m].taxable += profit;
  }

  return { data: Array.from({ length: 12 }, (_, i) => {
    const v = monthMap[i + 1] ?? { revenue: 0, cost: 0, unissued: 0, unknown: 0, taxable: 0 };
    return {
      month: i + 1,
      label: `${i + 1}월`,
      revenue: v.revenue,
      cost: v.cost,
      profit: v.revenue - v.cost,
      unissued: v.unissued,
      unknown: v.unknown,
      taxable: v.taxable,
    };
  }) };
}

function receiveRate(rows: { received_at: string | null }[]): ReceiveRate {
  const total = rows.length;
  const received = rows.filter((t) => t.received_at).length;
  return { total, received, rate: total > 0 ? Math.round((received / total) * 1000) / 10 : 0 };
}

/**
 * 선택 연/월 기준 접수 현황 — created_at 기준
 * 일별 접수 건수 + 연간/월간 접수 대비 입고율
 */
export async function getIntakeStats(year: number, month: number): Promise<StatsResult<IntakeStatsData>> {
  const denied = await requireStatsAccess();
  if (denied) return { error: denied };

  const supabase = await createClient();
  const { start, end } = yearRange(year);
  const { start: monthStart, end: monthEnd } = monthRange(year, month);

  const { data } = await supabase
    .from("repair_tickets")
    .select("created_at, received_at")
    .eq("is_test", false)
    .gte("created_at", start)
    .lt("created_at", end) as unknown as { data: { created_at: string; received_at: string | null }[] | null };

  const all = data ?? [];
  const [ms, me] = [Date.parse(monthStart), Date.parse(monthEnd)];
  const monthly = all.filter((t) => {
    const ts = Date.parse(t.created_at);
    return ts >= ms && ts < me;
  });

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayMap: Record<number, number> = {};
  for (const t of monthly) {
    const { day } = kstParts(t.created_at);
    dayMap[day] = (dayMap[day] ?? 0) + 1;
  }

  return { data: {
    daily: Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      label: `${i + 1}일`,
      count: dayMap[i + 1] ?? 0,
    })),
    annual: receiveRate(all),
    monthly: receiveRate(monthly),
  } };
}

/**
 * 선택 연/월 기준 기사별 매출 집계 — completed_at 기준
 */
export async function getTechnicianMonthlyRevenue(year: number, month: number): Promise<StatsResult<TechnicianRevenueData[]>> {
  const denied = await requireStatsAccess();
  if (denied) return { error: denied };

  const supabase = await createClient();
  const { start, end } = monthRange(year, month);

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, refunded_amount, assignee_id, completed_at, employees:assignee_id ( name )")
    .eq("is_test", false)
    .eq("status", "COMPLETED")
    .gte("completed_at", start)
    .lt("completed_at", end)
    .not("assignee_id", "is", null) as unknown as { data: { final_price: number | null; refunded_amount: number | null; assignee_id: string | null; completed_at: string | null; employees: { name: string } | { name: string }[] | null }[] | null };

  const map: Record<string, { name: string; revenue: number; count: number }> = {};
  for (const t of data ?? []) {
    const id = t.assignee_id as string;
    const emp = Array.isArray(t.employees) ? t.employees[0] : t.employees;
    const name = (emp as { name: string } | null)?.name ?? "미지정";
    if (!map[id]) map[id] = { name, revenue: 0, count: 0 };
    map[id].revenue += netRevenue(t);
    map[id].count += 1;
  }

  return { data: Object.entries(map)
    .map(([technicianId, v]) => ({ technicianId, ...v }))
    .sort((a, b) => b.revenue - a.revenue) };
}

/**
 * 선택 연/월 기준 기사별 최소견적 대비 성과 — completed_at 기준
 */
export async function getTechnicianPerformance(year: number, month: number): Promise<StatsResult<TechnicianPerformanceData[]>> {
  const denied = await requireStatsAccess();
  if (denied) return { error: denied };

  const supabase = await createClient();
  const { start, end } = monthRange(year, month);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("repair_tickets")
    .select("final_price, refunded_amount, material_cost, minimum_estimate, assignee_id, employees:assignee_id ( name )")
    .eq("is_test", false)
    .eq("status", "COMPLETED")
    .not("assignee_id", "is", null)
    .gte("completed_at", start)
    .lt("completed_at", end);

  const map: Record<
    string,
    { name: string; completedCount: number; totalRevenue: number; totalCost: number; netProfit: number; upsellAmount: number; upsellCount: number }
  > = {};

  for (const t of (data ?? []) as { final_price: number | null; refunded_amount: number | null; material_cost: number | null; minimum_estimate: number | null; assignee_id: string; employees: { name: string } | { name: string }[] | null }[]) {
    const id = t.assignee_id;
    const emp2 = Array.isArray(t.employees) ? t.employees[0] : t.employees;
    const name = (emp2 as { name: string } | null)?.name ?? "미지정";
    if (!map[id]) {
      map[id] = { name, completedCount: 0, totalRevenue: 0, totalCost: 0, netProfit: 0, upsellAmount: 0, upsellCount: 0 };
    }
    // 환불된 금액은 성과로 잡지 않는다 (전액 환불 건은 매출·초과달성 모두 0)
    const fp = netRevenue(t);
    const me = t.minimum_estimate ?? 0;
    map[id].completedCount += 1;
    map[id].totalRevenue += fp;
    map[id].totalCost += t.material_cost ?? 0;
    map[id].netProfit += netProfit(t);
    if (me > 0 && fp > me) {
      map[id].upsellAmount += fp - me;
      map[id].upsellCount += 1;
    }
  }

  return { data: Object.entries(map)
    .map(([technicianId, v]) => ({ technicianId, ...v }))
    .sort((a, b) => b.upsellAmount - a.upsellAmount) };
}

/**
 * 브랜드 표기 통합 — 정규화 키(소문자·공백 제거) → 표시 이름.
 * 접수 데이터는 그대로 두고 집계할 때만 묶는다.
 */
const BRAND_ALIASES: Record<string, string> = {
  삼성: "삼성", 삼성전자: "삼성", samsung: "삼성",
  애플: "애플", apple: "애플",
  마이크로소프트: "마이크로소프트", microsoft: "마이크로소프트", ms: "마이크로소프트",
  서피스: "마이크로소프트", surface: "마이크로소프트", ms서피스: "마이크로소프트", mssurface: "마이크로소프트",
  레노버: "레노버", lenovo: "레노버",
  asus: "ASUS", 아수스: "ASUS", 에이수스: "ASUS",
  lg: "LG", 엘지: "LG", lg전자: "LG",
  hp: "HP",
  델: "델", dell: "델",
  msi: "MSI",
  한성: "한성", 한성컴퓨터: "한성",
  에이서: "에이서", acer: "에이서",
};

/** "MSI[1][5]"처럼 붙은 대괄호 숫자와 공백을 빼고 소문자로 맞춘다 */
function brandKey(raw: string): string {
  return raw.replace(/\[\d+\]/g, "").replace(/\s+/g, "").toLowerCase();
}

/**
 * 브랜드별 접수 건수 Top 5 — 전체 접수 기준
 * 한글/영문 별칭과 영문 대소문자는 같은 브랜드로 묶는다.
 */
export async function getBrandBreakdown(): Promise<StatsResult<BrandBreakdownData[]>> {
  const denied = await requireStatsAccess();
  if (denied) return { error: denied };

  const supabase = await createClient();

  const { data } = await supabase
    .from("repair_tickets")
    .select("device_brand")
    .eq("is_test", false)
    .not("device_brand", "is", null)
    .neq("device_brand", "");

  // 별칭에 없는 브랜드는 정규화 키로 묶고, 처음 본 표기를 표시 이름으로 쓴다
  const map: Record<string, { brand: string; count: number }> = {};
  for (const t of data ?? []) {
    const raw = t.device_brand as string;
    const key = brandKey(raw);
    if (!key) continue;
    const group = BRAND_ALIASES[key] ?? key;
    if (!map[group]) map[group] = { brand: BRAND_ALIASES[key] ?? raw.replace(/\[\d+\]/g, "").trim(), count: 0 };
    map[group].count += 1;
  }

  return { data: Object.values(map)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5) };
}

/**
 * 선택 연/월 기준 티켓 상태별 비율 — created_at 기준
 */
export async function getStatusBreakdown(year: number, month: number): Promise<StatsResult<StatusBreakdownData[]>> {
  const denied = await requireStatsAccess();
  if (denied) return { error: denied };

  const supabase = await createClient();
  const { start, end } = monthRange(year, month);

  const { data } = await supabase
    .from("repair_tickets")
    .select("status")
    .eq("is_test", false)
    .gte("created_at", start)
    .lt("created_at", end);

  const map: Record<string, number> = {};
  for (const t of data ?? []) {
    map[t.status] = (map[t.status] ?? 0) + 1;
  }

  return { data: Object.entries(map).map(([status, count]) => ({
    status,
    label: STATUS_LABEL_MAP[status]?.label ?? status,
    count,
    color: STATUS_LABEL_MAP[status]?.color ?? "#6b7280",
  })) };
}

/**
 * 선택 연/월 기준 접수 방식별 접수 건수 — created_at 기준
 */
export async function getReceiptTypeBreakdown(year: number, month: number): Promise<StatsResult<ReceiptTypeBreakdownData[]>> {
  const denied = await requireStatsAccess();
  if (denied) return { error: denied };

  const supabase = await createClient();
  const { start, end } = monthRange(year, month);

  const { data } = await supabase
    .from("repair_tickets")
    .select("receipt_type")
    .eq("is_test", false)
    .gte("created_at", start)
    .lt("created_at", end);

  const map: Record<string, number> = {};
  for (const t of data ?? []) {
    const rt = t.receipt_type as string;
    map[rt] = (map[rt] ?? 0) + 1;
  }

  const ORDER = ["WALK_IN", "VISIT", "QUICK", "PARCEL"];

  return { data: ORDER.filter((k) => map[k] !== undefined).map((k) => ({
    receiptType: k,
    label: RECEIPT_LABEL_MAP[k] ?? k,
    count: map[k] ?? 0,
  })) };
}

/**
 * 선택 연/월 기준 취소율 통계 — 접수건/담당기사별
 */
export async function getCancelStats(year: number, month: number): Promise<StatsResult<CancelStatsData>> {
  const denied = await requireStatsAccess();
  if (denied) return { error: denied };

  const supabase = await createClient();

  const { start: monthStart, end: monthEnd } = monthRange(year, month);

  const { data } = await supabase
    .from("repair_tickets")
    .select(
      "status, created_at, canceled_at, received_at, assignee_id, employees:assignee_id ( name )"
    )
    .eq("is_test", false) as unknown as { data: { status: string; created_at: string; canceled_at: string | null; received_at: string | null; assignee_id: string | null; employees: { name: string } | { name: string }[] | null }[] | null };

  const all = data ?? [];

  // 선택 월 접수 (created_at 기준)
  const monthlyAll = all.filter(
    (t) => t.created_at >= monthStart && t.created_at < monthEnd
  );
  const total = monthlyAll.length;

  // 선택 월 접수 중 입고 완료된 건수 (입고 후 취소율 분모)
  const receivedCount = monthlyAll.filter((t) => t.received_at).length;

  // 선택 월 취소 (canceled_at 기준)
  const monthlyCanceledTickets = all.filter(
    (t) =>
      t.status === "CANCELED" &&
      t.canceled_at &&
      t.canceled_at >= monthStart &&
      t.canceled_at < monthEnd
  );
  const totalCanceled = monthlyCanceledTickets.length;
  const totalRate = total > 0 ? Math.round((totalCanceled / total) * 1000) / 10 : 0;

  // 입고 전/후 취소 분리 (received_at 유무 기준)
  const preReceiptCanceled = monthlyCanceledTickets.filter((t) => !t.received_at).length;
  const postReceiptCanceled = monthlyCanceledTickets.filter((t) => t.received_at).length;
  // 입고 전 취소율 = 입고 전 취소 ÷ 전체 접수
  const preReceiptRate = total > 0 ? Math.round((preReceiptCanceled / total) * 1000) / 10 : 0;
  // 입고 후 취소율 = 입고 후 취소 ÷ 입고 완료 건수
  const postReceiptRate = receivedCount > 0 ? Math.round((postReceiptCanceled / receivedCount) * 1000) / 10 : 0;

  const monthlyCanceled = totalCanceled;
  const monthlyRate = totalRate;

  // 기사별 집계 (선택 월 내 데이터만)
  type TechAcc = {
    name: string;
    totalCount: number;
    canceledCount: number;
    monthlyTotal: number;
    monthlyCanceled: number;
  };
  const techMap: Record<string, TechAcc> = {};

  for (const t of all) {
    const id = t.assignee_id as string | null;
    if (!id) continue;

    const inMonth = t.created_at >= monthStart && t.created_at < monthEnd;
    const canceledInMonth =
      t.status === "CANCELED" &&
      t.canceled_at &&
      t.canceled_at >= monthStart &&
      t.canceled_at < monthEnd;

    if (!inMonth && !canceledInMonth) continue;

    const emp = Array.isArray(t.employees) ? t.employees[0] : t.employees;
    const name = (emp as { name: string } | null)?.name ?? "미지정";

    if (!techMap[id]) {
      techMap[id] = { name, totalCount: 0, canceledCount: 0, monthlyTotal: 0, monthlyCanceled: 0 };
    }

    if (inMonth) techMap[id].totalCount += 1;
    if (inMonth && t.status === "CANCELED") techMap[id].canceledCount += 1;
    if (inMonth) techMap[id].monthlyTotal += 1;
    if (canceledInMonth) techMap[id].monthlyCanceled += 1;
  }

  const byTechnician: TechCancelData[] = Object.entries(techMap)
    .map(([technicianId, v]) => ({
      technicianId,
      name: v.name,
      totalCount: v.totalCount,
      canceledCount: v.canceledCount,
      cancelRate:
        v.totalCount > 0
          ? Math.round((v.canceledCount / v.totalCount) * 1000) / 10
          : 0,
      monthlyTotal: v.monthlyTotal,
      monthlyCanceled: v.monthlyCanceled,
      monthlyCancelRate:
        v.monthlyTotal > 0
          ? Math.round((v.monthlyCanceled / v.monthlyTotal) * 1000) / 10
          : 0,
    }))
    .filter((t) => t.totalCount > 0)
    .sort((a, b) => b.cancelRate - a.cancelRate);

  return { data: {
    totalCanceled,
    totalRate,
    monthlyCanceled,
    monthlyRate,
    preReceiptCanceled,
    preReceiptRate,
    postReceiptCanceled,
    postReceiptRate,
    receivedCount,
    byTechnician,
  } };
}
