import { createClient } from "@/utils/supabase/server";

export interface DashboardStats {
  totalTickets: number;
  statusCounts: Record<string, number>;
  receiptTypeCounts: Record<string, number>;
  monthlyRevenue: number;
  monthlyProfit: number;
  /** TECHNICIAN/EXPERT_REPAIR 전용: 본인 배정 ASSIGNED 건수 */
  myNewCount: number;
  /** TECHNICIAN/EXPERT_REPAIR 전용: 본인 배정 IN_PROGRESS 건수 */
  myInProgressCount: number;
  /** TECHNICIAN/EXPERT_REPAIR 전용: 관리자 메시지가 있는 본인 배정 티켓 ID 목록 */
  adminMessageTicketIds: string[];
  /** 전체 취소 건수 */
  canceledCount: number;
  /** 전체 대비 취소율 (소수점 1자리) */
  cancelRate: number;
  /** ADMIN/MANAGER 전용: 자재 출고 요청 대기 건수 */
  materialRequestCount: number;
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
 * TECHNICIAN/EXPERT_REPAIR인 경우 본인 배정 건수를 별도 집계
 */
export async function getDashboardStats(
  employeeId?: string,
  role?: string
): Promise<DashboardStats> {
  const supabase = await createClient();

  // 전체 티켓 조회 (status, receipt_type, final_price, material_cost)
  const { data: tickets } = await supabase
    .from("repair_tickets")
    .select("status, receipt_type, final_price, material_cost, created_at, assignee_id, has_admin_message, id");

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

  // 6) TECHNICIAN/EXPERT_REPAIR 전용: 본인 배정 건수
  const isTech = role === "TECHNICIAN" || role === "EXPERT_REPAIR";
  const myNewCount = isTech && employeeId
    ? all.filter((t) => t.status === "ASSIGNED" && t.assignee_id === employeeId).length
    : 0;
  const myInProgressCount = isTech && employeeId
    ? all.filter((t) => t.status === "IN_PROGRESS" && t.assignee_id === employeeId).length
    : 0;

  // 7) TECHNICIAN/EXPERT_REPAIR 전용: 관리자 메시지가 있는 본인 배정 티켓 ID
  const adminMessageTicketIds = isTech && employeeId
    ? all
        .filter((t) => t.has_admin_message === true && t.assignee_id === employeeId)
        .map((t) => t.id as string)
    : [];

  // 8) 취소 통계
  const canceledCount = statusCounts["CANCELED"] ?? 0;
  const cancelRate = totalTickets > 0
    ? Math.round((canceledCount / totalTickets) * 1000) / 10
    : 0;

  // 9) ADMIN/MANAGER 전용: 자재 출고 요청 대기 건수
  let materialRequestCount = 0;
  const isAdminManager = role === "ADMIN" || role === "MANAGER";
  if (isAdminManager) {
    const { count } = await supabase
      .from("ticket_materials")
      .select("id", { count: "exact", head: true })
      .eq("request_status", "requested");
    materialRequestCount = count ?? 0;
  }

  return {
    totalTickets,
    statusCounts,
    receiptTypeCounts,
    monthlyRevenue,
    monthlyProfit,
    myNewCount,
    myInProgressCount,
    adminMessageTicketIds,
    canceledCount,
    cancelRate,
    materialRequestCount,
  };
}

/**
 * 최근 활동 로그 10건 조회
 * ADMIN/MANAGER: 전체 로그
 * 기타 직급: 본인이 작성했거나 본인에게 배정된 티켓의 로그만 조회
 */
export async function getRecentLogs(
  employeeId?: string,
  role?: string
): Promise<RecentLog[]> {
  const supabase = await createClient();

  const isAdmin = role === "ADMIN" || role === "MANAGER";

  if (isAdmin || !employeeId) {
    // 관리자/팀장: 전체 로그
    const { data: logs } = await supabase
      .from("ticket_logs")
      .select("id, message, created_at, ticket_id, employees:employee_id ( name )")
      .order("created_at", { ascending: false })
      .limit(10);

    return mapLogs(logs);
  }

  // 일반 직원: 본인 작성 로그 + 본인 배정 티켓 로그
  const [{ data: myLogs }, { data: assignedLogs }] = await Promise.all([
    // 내가 작성한 로그
    supabase
      .from("ticket_logs")
      .select("id, message, created_at, ticket_id, employees:employee_id ( name )")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(10),
    // 나에게 배정된 티켓의 로그 (다른 사람이 작성한 것)
    supabase
      .from("ticket_logs")
      .select(
        "id, message, created_at, ticket_id, employees:employee_id ( name ), repair_tickets!inner ( assignee_id )"
      )
      .eq("repair_tickets.assignee_id", employeeId)
      .neq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // 병합 후 최신순 정렬, 10건 제한
  return [...mapLogs(myLogs), ...mapLogs(assignedLogs)]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);
}

function mapLogs(
  logs: { id: string; message: string; created_at: string; ticket_id: string; employees: unknown }[] | null
): RecentLog[] {
  return (logs ?? []).map((log) => ({
    id: log.id,
    message: log.message,
    created_at: log.created_at,
    ticket_id: log.ticket_id,
    employee_name:
      (log.employees as { name: string } | null)?.name ?? "알 수 없음",
  }));
}
