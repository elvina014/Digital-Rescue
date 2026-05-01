"use server";

import { createClient } from "@/utils/supabase/server";

// ─── 공통 날짜 헬퍼 ───────────────────────────────────────────
function yearRange(year: number) {
  return {
    start: new Date(year, 0, 1).toISOString(),
    end:   new Date(year + 1, 0, 1).toISOString(),
  };
}
function monthRange(year: number, month: number) {
  return {
    start: new Date(year, month - 1, 1).toISOString(),
    end:   new Date(year, month, 1).toISOString(),
  };
}

// ─── 타입 정의 ────────────────────────────────────────────────

export interface MonthlyRevenueData {
  month: number;
  label: string;
  revenue: number;
}

export interface DailyRevenueData {
  day: number;
  label: string;
  revenue: number;
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
  /** 선택 월 취소율 % */
  totalRate: number;
  /** 당월 취소 건수 (canceled_at 기준) */
  monthlyCanceled: number;
  /** 당월 취소율 % (당월 접수 대비) */
  monthlyRate: number;
  /** 담당기사별 취소율 */
  byTechnician: TechCancelData[];
}

const STATUS_LABEL_MAP: Record<string, { label: string; color: string }> = {
  NEW:              { label: "신규접수",  color: "#3b82f6" },
  ASSIGNED:         { label: "기사배정",  color: "#8b5cf6" },
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
export async function getAnnualRevenue(year: number): Promise<MonthlyRevenueData[]> {
  const supabase = await createClient();
  const { start } = yearRange(year);

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, completed_at")
    .eq("status", "COMPLETED")
    .gte("completed_at", start) as unknown as { data: { final_price: number | null; completed_at: string | null }[] | null };

  const monthMap: Record<number, number> = {};
  for (const t of data ?? []) {
    if (!t.completed_at) continue;
    const m = new Date(t.completed_at).getMonth() + 1;
    // 해당 연도 데이터만 포함
    if (new Date(t.completed_at).getFullYear() !== year) continue;
    monthMap[m] = (monthMap[m] ?? 0) + ((t.final_price as number) ?? 0);
  }

  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: `${i + 1}월`,
    revenue: monthMap[i + 1] ?? 0,
  }));
}

/**
 * 선택 연/월 기준 일별 매출 집계 — completed_at 기준
 */
export async function getMonthlyDailyRevenue(year: number, month: number): Promise<DailyRevenueData[]> {
  const supabase = await createClient();
  const { start, end } = monthRange(year, month);

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, completed_at")
    .eq("status", "COMPLETED")
    .gte("completed_at", start)
    .lt("completed_at", end) as unknown as { data: { final_price: number | null; completed_at: string | null }[] | null };

  const daysInMonth = new Date(year, month, 0).getDate();
  const dayMap: Record<number, number> = {};
  for (const t of data ?? []) {
    if (!t.completed_at) continue;
    const day = new Date(t.completed_at).getDate();
    dayMap[day] = (dayMap[day] ?? 0) + ((t.final_price as number) ?? 0);
  }

  return Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    label: `${i + 1}일`,
    revenue: dayMap[i + 1] ?? 0,
  }));
}

/**
 * 선택 연/월 기준 기사별 매출 집계 — completed_at 기준
 */
export async function getTechnicianMonthlyRevenue(year: number, month: number): Promise<TechnicianRevenueData[]> {
  const supabase = await createClient();
  const { start, end } = monthRange(year, month);

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, assignee_id, completed_at, employees:assignee_id ( name )")
    .eq("status", "COMPLETED")
    .gte("completed_at", start)
    .lt("completed_at", end)
    .not("assignee_id", "is", null) as unknown as { data: { final_price: number | null; assignee_id: string | null; completed_at: string | null; employees: { name: string } | { name: string }[] | null }[] | null };

  const map: Record<string, { name: string; revenue: number; count: number }> = {};
  for (const t of data ?? []) {
    const id = t.assignee_id as string;
    const emp = Array.isArray(t.employees) ? t.employees[0] : t.employees;
    const name = (emp as { name: string } | null)?.name ?? "미지정";
    if (!map[id]) map[id] = { name, revenue: 0, count: 0 };
    map[id].revenue += (t.final_price as number) ?? 0;
    map[id].count += 1;
  }

  return Object.entries(map)
    .map(([technicianId, v]) => ({ technicianId, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

/**
 * 선택 연/월 기준 기사별 최소견적 대비 성과 — completed_at 기준
 */
export async function getTechnicianPerformance(year: number, month: number): Promise<TechnicianPerformanceData[]> {
  const supabase = await createClient();
  const { start, end } = monthRange(year, month);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("repair_tickets")
    .select("final_price, minimum_estimate, assignee_id, employees:assignee_id ( name )")
    .eq("status", "COMPLETED")
    .not("assignee_id", "is", null)
    .gte("completed_at", start)
    .lt("completed_at", end);

  const map: Record<
    string,
    { name: string; completedCount: number; totalRevenue: number; upsellAmount: number; upsellCount: number }
  > = {};

  for (const t of (data ?? []) as { final_price: number | null; minimum_estimate: number | null; assignee_id: string; employees: { name: string } | { name: string }[] | null }[]) {
    const id = t.assignee_id;
    const emp2 = Array.isArray(t.employees) ? t.employees[0] : t.employees;
    const name = (emp2 as { name: string } | null)?.name ?? "미지정";
    if (!map[id]) {
      map[id] = { name, completedCount: 0, totalRevenue: 0, upsellAmount: 0, upsellCount: 0 };
    }
    const fp = t.final_price ?? 0;
    const me = t.minimum_estimate ?? 0;
    map[id].completedCount += 1;
    map[id].totalRevenue += fp;
    if (me > 0 && fp > me) {
      map[id].upsellAmount += fp - me;
      map[id].upsellCount += 1;
    }
  }

  return Object.entries(map)
    .map(([technicianId, v]) => ({ technicianId, ...v }))
    .sort((a, b) => b.upsellAmount - a.upsellAmount);
}

/**
 * 선택 연/월 기준 브랜드별 접수 건수 Top 5 — created_at 기준
 */
export async function getBrandBreakdown(year: number, month: number): Promise<BrandBreakdownData[]> {
  const supabase = await createClient();
  const { start, end } = monthRange(year, month);

  const { data } = await supabase
    .from("repair_tickets")
    .select("device_brand")
    .not("device_brand", "is", null)
    .neq("device_brand", "")
    .gte("created_at", start)
    .lt("created_at", end);

  const map: Record<string, number> = {};
  for (const t of data ?? []) {
    const brand = (t.device_brand as string).trim();
    if (brand) map[brand] = (map[brand] ?? 0) + 1;
  }

  return Object.entries(map)
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

/**
 * 선택 연/월 기준 티켓 상태별 비율 — created_at 기준
 */
export async function getStatusBreakdown(year: number, month: number): Promise<StatusBreakdownData[]> {
  const supabase = await createClient();
  const { start, end } = monthRange(year, month);

  const { data } = await supabase
    .from("repair_tickets")
    .select("status")
    .gte("created_at", start)
    .lt("created_at", end);

  const map: Record<string, number> = {};
  for (const t of data ?? []) {
    map[t.status] = (map[t.status] ?? 0) + 1;
  }

  return Object.entries(map).map(([status, count]) => ({
    status,
    label: STATUS_LABEL_MAP[status]?.label ?? status,
    count,
    color: STATUS_LABEL_MAP[status]?.color ?? "#6b7280",
  }));
}

/**
 * 선택 연/월 기준 접수 방식별 접수 건수 — created_at 기준
 */
export async function getReceiptTypeBreakdown(year: number, month: number): Promise<ReceiptTypeBreakdownData[]> {
  const supabase = await createClient();
  const { start, end } = monthRange(year, month);

  const { data } = await supabase
    .from("repair_tickets")
    .select("receipt_type")
    .gte("created_at", start)
    .lt("created_at", end);

  const map: Record<string, number> = {};
  for (const t of data ?? []) {
    const rt = t.receipt_type as string;
    map[rt] = (map[rt] ?? 0) + 1;
  }

  const ORDER = ["WALK_IN", "VISIT", "QUICK", "PARCEL"];

  return ORDER.filter((k) => map[k] !== undefined).map((k) => ({
    receiptType: k,
    label: RECEIPT_LABEL_MAP[k] ?? k,
    count: map[k] ?? 0,
  }));
}

/**
 * 선택 연/월 기준 취소율 통계 — 접수건/담당기사별
 */
export async function getCancelStats(year: number, month: number): Promise<CancelStatsData> {
  const supabase = await createClient();

  const { start: monthStart, end: monthEnd } = monthRange(year, month);

  const { data } = await supabase
    .from("repair_tickets")
    .select(
      "status, created_at, canceled_at, assignee_id, employees:assignee_id ( name )"
    ) as unknown as { data: { status: string; created_at: string; canceled_at: string | null; assignee_id: string | null; employees: { name: string } | { name: string }[] | null }[] | null };

  const all = data ?? [];

  // 선택 월 접수 (created_at 기준)
  const monthlyAll = all.filter(
    (t) => t.created_at >= monthStart && t.created_at < monthEnd
  );
  const total = monthlyAll.length;

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

  return { totalCanceled, totalRate, monthlyCanceled, monthlyRate, byTechnician };
}
