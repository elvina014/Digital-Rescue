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
  /** 전체 기간 */
  totalCount: number;
  canceledCount: number;
  cancelRate: number;
  /** 당월 */
  monthlyTotal: number;
  monthlyCanceled: number;
  monthlyCancelRate: number;
}

export interface CancelStatsData {
  /** 전체 취소 건수 */
  totalCanceled: number;
  /** 전체 취소율 % */
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

// ─── 기존 함수 (completed_at 기준으로 수정) ───────────────────

/**
 * 올해 기준 월별 매출 집계 — completed_at 기준
 */
export async function getAnnualRevenue(): Promise<MonthlyRevenueData[]> {
  const supabase = await createClient();
  const now = new Date();
  const { start } = yearRange(now.getFullYear());

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, completed_at")
    .eq("status", "COMPLETED")
    .gte("completed_at", start);

  const monthMap: Record<number, number> = {};
  for (const t of data ?? []) {
    if (!t.completed_at) continue;
    const month = new Date(t.completed_at).getMonth() + 1;
    monthMap[month] = (monthMap[month] ?? 0) + ((t.final_price as number) ?? 0);
  }

  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: `${i + 1}월`,
    revenue: monthMap[i + 1] ?? 0,
  }));
}

/**
 * 이번 달 일별 매출 집계 — completed_at 기준
 */
export async function getMonthlyDailyRevenue(): Promise<DailyRevenueData[]> {
  const supabase = await createClient();
  const now = new Date();
  const { start, end } = monthRange(now.getFullYear(), now.getMonth() + 1);

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, completed_at")
    .eq("status", "COMPLETED")
    .gte("completed_at", start)
    .lt("completed_at", end);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
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
 * 이번 달 기사별 매출 집계 — completed_at 기준
 */
export async function getTechnicianMonthlyRevenue(): Promise<TechnicianRevenueData[]> {
  const supabase = await createClient();
  const now = new Date();
  const { start, end } = monthRange(now.getFullYear(), now.getMonth() + 1);

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, assignee_id, completed_at, employees:assignee_id ( name )")
    .eq("status", "COMPLETED")
    .gte("completed_at", start)
    .lt("completed_at", end)
    .not("assignee_id", "is", null);

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
 * 전체 기간 기사별 최소견적 대비 성과
 */
export async function getTechnicianPerformance(): Promise<TechnicianPerformanceData[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, minimum_estimate, assignee_id, employees:assignee_id ( name )")
    .eq("status", "COMPLETED")
    .not("assignee_id", "is", null);

  const map: Record<
    string,
    { name: string; completedCount: number; totalRevenue: number; upsellAmount: number; upsellCount: number }
  > = {};

  for (const t of data ?? []) {
    const id = t.assignee_id as string;
    const emp2 = Array.isArray(t.employees) ? t.employees[0] : t.employees;
    const name = (emp2 as { name: string } | null)?.name ?? "미지정";
    if (!map[id]) {
      map[id] = { name, completedCount: 0, totalRevenue: 0, upsellAmount: 0, upsellCount: 0 };
    }
    const fp = (t.final_price as number) ?? 0;
    const me = (t.minimum_estimate as number) ?? 0;
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
 * 브랜드별 접수 건수 Top 5
 */
export async function getBrandBreakdown(): Promise<BrandBreakdownData[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("repair_tickets")
    .select("device_brand")
    .not("device_brand", "is", null)
    .neq("device_brand", "");

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
 * 현재 전체 티켓 상태별 비율
 */
export async function getStatusBreakdown(): Promise<StatusBreakdownData[]> {
  const supabase = await createClient();

  const { data } = await supabase.from("repair_tickets").select("status");

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

// ─── 신규 함수 ────────────────────────────────────────────────

/**
 * 접수 방식별 접수 건수 (전체)
 */
export async function getReceiptTypeBreakdown(): Promise<ReceiptTypeBreakdownData[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("repair_tickets")
    .select("receipt_type");

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
 * 취소율 통계 — 전체 / 당월 / 담당기사별
 * - 전체: 모든 티켓 대비 취소 비율
 * - 당월: 당월 접수(created_at) 대비 당월 취소(canceled_at) 비율
 * - 기사별: 배정된 티켓 대비 취소 비율 (전체 + 당월)
 */
export async function getCancelStats(): Promise<CancelStatsData> {
  const supabase = await createClient();

  const now = new Date();
  const { start: monthStart, end: monthEnd } = monthRange(now.getFullYear(), now.getMonth() + 1);

  const { data } = await supabase
    .from("repair_tickets")
    .select(
      "status, created_at, canceled_at, assignee_id, employees:assignee_id ( name )"
    );

  const all = data ?? [];
  const total = all.length;

  // 전체 취소
  const totalCanceled = all.filter((t) => t.status === "CANCELED").length;
  const totalRate = total > 0 ? Math.round((totalCanceled / total) * 1000) / 10 : 0;

  // 당월 접수 (created_at 기준)
  const monthlyAll = all.filter(
    (t) => t.created_at >= monthStart && t.created_at < monthEnd
  );
  // 당월 취소 (canceled_at 기준)
  const monthlyCanceledTickets = all.filter(
    (t) =>
      t.status === "CANCELED" &&
      t.canceled_at &&
      t.canceled_at >= monthStart &&
      t.canceled_at < monthEnd
  );
  const monthlyCanceled = monthlyCanceledTickets.length;
  const monthlyRate =
    monthlyAll.length > 0
      ? Math.round((monthlyCanceled / monthlyAll.length) * 1000) / 10
      : 0;

  // 기사별 집계
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
    const emp = Array.isArray(t.employees) ? t.employees[0] : t.employees;
    const name = (emp as { name: string } | null)?.name ?? "미지정";

    if (!techMap[id]) {
      techMap[id] = { name, totalCount: 0, canceledCount: 0, monthlyTotal: 0, monthlyCanceled: 0 };
    }

    // 전체
    techMap[id].totalCount += 1;
    if (t.status === "CANCELED") techMap[id].canceledCount += 1;

    // 당월
    const inMonth = t.created_at >= monthStart && t.created_at < monthEnd;
    if (inMonth) techMap[id].monthlyTotal += 1;

    const canceledInMonth =
      t.status === "CANCELED" &&
      t.canceled_at &&
      (t.canceled_at as string) >= monthStart &&
      (t.canceled_at as string) < monthEnd;
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
