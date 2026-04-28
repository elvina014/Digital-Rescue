"use server";

import { createClient } from "@/utils/supabase/server";

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

const STATUS_LABEL_MAP: Record<string, { label: string; color: string }> = {
  NEW: { label: "신규접수", color: "#3b82f6" },
  ASSIGNED: { label: "기사배정", color: "#8b5cf6" },
  IN_PROGRESS: { label: "수리중", color: "#f59e0b" },
  WAITING_APPROVAL: { label: "승인대기", color: "#f97316" },
  COMPLETED: { label: "수리완료", color: "#10b981" },
  CANCELED: { label: "취소", color: "#6b7280" },
};

/** 올해 기준 월별 매출 집계 (COMPLETED 티켓의 final_price 합산) */
export async function getAnnualRevenue(): Promise<MonthlyRevenueData[]> {
  const supabase = await createClient();
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, created_at")
    .eq("status", "COMPLETED")
    .gte("created_at", yearStart);

  const monthMap: Record<number, number> = {};
  for (const t of data ?? []) {
    const month = new Date(t.created_at).getMonth() + 1;
    monthMap[month] = (monthMap[month] ?? 0) + (t.final_price ?? 0);
  }

  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: `${i + 1}월`,
    revenue: monthMap[i + 1] ?? 0,
  }));
}

/** 이번 달 기준 일별 매출 집계 */
export async function getMonthlyDailyRevenue(): Promise<DailyRevenueData[]> {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, created_at")
    .eq("status", "COMPLETED")
    .gte("created_at", monthStart)
    .lt("created_at", monthEnd);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayMap: Record<number, number> = {};
  for (const t of data ?? []) {
    const day = new Date(t.created_at).getDate();
    dayMap[day] = (dayMap[day] ?? 0) + (t.final_price ?? 0);
  }

  return Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    label: `${i + 1}일`,
    revenue: dayMap[i + 1] ?? 0,
  }));
}

/** 이번 달 기준 기사별 매출 집계 */
export async function getTechnicianMonthlyRevenue(): Promise<TechnicianRevenueData[]> {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  const { data } = await supabase
    .from("repair_tickets")
    .select("final_price, assignee_id, employees:assignee_id ( name )")
    .eq("status", "COMPLETED")
    .gte("created_at", monthStart)
    .lt("created_at", monthEnd)
    .not("assignee_id", "is", null);

  const map: Record<string, { name: string; revenue: number; count: number }> = {};
  for (const t of data ?? []) {
    const id = t.assignee_id as string;
    const emp = Array.isArray(t.employees) ? t.employees[0] : t.employees;
    const name = (emp as { name: string } | null)?.name ?? "미지정";
    if (!map[id]) map[id] = { name, revenue: 0, count: 0 };
    map[id].revenue += t.final_price ?? 0;
    map[id].count += 1;
  }

  return Object.entries(map)
    .map(([technicianId, v]) => ({ technicianId, ...v }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** 전체 기간 기사별 최소견적 대비 확정견적 성과 집계 */
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

/** 브랜드별 접수 건수 Top 5 */
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

/** 현재 전체 티켓 상태별 비율 */
export async function getStatusBreakdown(): Promise<StatusBreakdownData[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("repair_tickets")
    .select("status");

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
