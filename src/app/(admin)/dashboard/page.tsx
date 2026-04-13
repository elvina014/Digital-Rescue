import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import type { EmployeeRole } from "@/types";

/** 직급 한글 매핑 */
const ROLE_LABEL: Record<EmployeeRole, string> = {
  ADMIN: "관리자",
  MANAGER: "팀장",
  RECEPTION: "접수처",
  TECHNICIAN: "담당기사",
  EXPERT_REPAIR: "정밀수리팀",
  CS: "고객서비스",
};

interface StatCard {
  label: string;
  value: number;
  color: string;
}

/**
 * 관리자 대시보드
 * 환영 인사 + 접수건 통계 Summary Cards
 */
export default async function DashboardPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");

  const supabase = await createClient();
  const roleLabel = ROLE_LABEL[employee.role] ?? employee.role;

  // 접수건 통계 조회 (상태별 카운트)
  const { data: tickets } = await supabase
    .from("repair_tickets")
    .select("status");

  const statusCounts = {
    total: tickets?.length ?? 0,
    new: tickets?.filter((t) => t.status === "NEW").length ?? 0,
    assigned: tickets?.filter((t) => t.status === "ASSIGNED").length ?? 0,
    inProgress: tickets?.filter((t) => t.status === "IN_PROGRESS").length ?? 0,
    waitingApproval:
      tickets?.filter((t) => t.status === "WAITING_APPROVAL").length ?? 0,
    completed: tickets?.filter((t) => t.status === "COMPLETED").length ?? 0,
    canceled: tickets?.filter((t) => t.status === "CANCELED").length ?? 0,
  };

  const statCards: StatCard[] = [
    {
      label: "전체 접수건",
      value: statusCounts.total,
      color: "border-l-blue-500",
    },
    {
      label: "신규 접수",
      value: statusCounts.new,
      color: "border-l-sky-500",
    },
    {
      label: "수리 진행 중",
      value: statusCounts.inProgress,
      color: "border-l-yellow-500",
    },
    {
      label: "승인 대기",
      value: statusCounts.waitingApproval,
      color: "border-l-orange-500",
    },
    {
      label: "완료",
      value: statusCounts.completed,
      color: "border-l-green-500",
    },
    {
      label: "취소",
      value: statusCounts.canceled,
      color: "border-l-gray-400",
    },
  ];

  return (
    <div>
      {/* 환영 인사 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
        <p className="mt-2 text-gray-600">
          환영합니다,{" "}
          <span className="font-semibold text-gray-900">{employee.name}</span>{" "}
          <span className="rounded bg-blue-100 px-2 py-0.5 text-sm font-medium text-blue-700">
            {roleLabel}
          </span>
          님!
        </p>
      </div>

      {/* 통계 카드 그리드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border border-gray-200 border-l-4 bg-white p-5 shadow-sm ${card.color}`}
          >
            <p className="text-sm font-medium text-gray-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900">
              {card.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
