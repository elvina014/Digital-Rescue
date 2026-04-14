import { createClient } from "@/utils/supabase/server";

export interface DashboardStats {
  totalTickets: number;
  statusCounts: Record<string, number>;
  receiptTypeCounts: Record<string, number>;
  monthlyRevenue: number;
  monthlyProfit: number;
}

export interface RecentLog {
  id: string;
  message: string;
  created_at: string;
  employee_name: string;
  ticket_id: string;
}

/**
 * 대시보드 통계 데이터 집계
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();

  // 전체 티켓 조회 (status, receipt_type, final_price, material_cost)
  const { data: tickets } = await supabase
    .from("repair_tickets")
    .select("status, receipt_type, final_price, material_cost, created_at");

  const all = tickets ?? [];

  // 1) 전체 티켓 수
  const totalTickets = all.length;

  // 2) 상태별 카운트
  const statusCounts: Record<string, number> = {};
  for (const t of all) {
    statusCounts[t.status] = (statusCounts[t.status] ?? 0) + 1;
  }

  // 3) 접수 방식별 카운트
  const receiptTypeCounts: Record<string, number> = {};
  for (const t of all) {
    receiptTypeCounts[t.receipt_type] = (receiptTypeCounts[t.receipt_type] ?? 0) + 1;
  }

  // 4) 이번 달 기준
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const completedThisMonth = all.filter(
    (t) => t.status === "COMPLETED" && t.created_at >= monthStart
  );

  // 이번 달 예상 매출: COMPLETED 티켓의 final_price 합계
  const monthlyRevenue = completedThisMonth.reduce(
    (sum, t) => sum + (t.final_price ?? 0),
    0
  );

  // 5) 이번 달 예상 수익: (final_price - material_cost) 합계
  const monthlyProfit = completedThisMonth.reduce(
    (sum, t) => sum + ((t.final_price ?? 0) - (t.material_cost ?? 0)),
    0
  );

  return {
    totalTickets,
    statusCounts,
    receiptTypeCounts,
    monthlyRevenue,
    monthlyProfit,
  };
}

/**
 * 최근 활동 로그 10건 조회
 */
export async function getRecentLogs(): Promise<RecentLog[]> {
  const supabase = await createClient();

  const { data: logs } = await supabase
    .from("ticket_logs")
    .select("id, message, created_at, ticket_id, employees:employee_id ( name )")
    .order("created_at", { ascending: false })
    .limit(10);

  return (logs ?? []).map((log) => ({
    id: log.id,
    message: log.message,
    created_at: log.created_at,
    ticket_id: log.ticket_id,
    employee_name:
      (log.employees as unknown as { name: string } | null)?.name ?? "알 수 없음",
  }));
}
