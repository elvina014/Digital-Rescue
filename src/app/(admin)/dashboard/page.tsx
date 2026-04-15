import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentEmployee } from "@/lib/auth";
import { getDashboardStats, getRecentLogs } from "@/app/actions/dashboardActions";
import type { EmployeeRole } from "@/types";
import {
  ClipboardList,
  PlusCircle,
  Wrench,
  Clock,
  CheckCircle2,
  Banknote,
  TrendingUp,
  Truck,
  Building2,
  MapPin,
  Activity,
} from "lucide-react";

/** 직급 한글 매핑 */
const ROLE_LABEL: Record<EmployeeRole, string> = {
  ADMIN: "관리자",
  MANAGER: "팀장",
  RECEPTION: "접수처",
  TECHNICIAN: "담당기사",
  EXPERT_REPAIR: "정밀수리팀",
  CS: "고객서비스",
};

const RECEIPT_LABEL: Record<string, { label: string; icon: typeof Truck }> = {
  DELIVERY: { label: "퀵/택배", icon: Truck },
  WALK_IN: { label: "내방", icon: Building2 },
  VISIT: { label: "방문", icon: MapPin },
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * 관리자 대시보드
 * 통계 요약 카드 + 접수 방식 비율 + 최근 활동 타임라인
 */
export default async function DashboardPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");

  const [stats, recentLogs] = await Promise.all([
    getDashboardStats(employee.id, employee.role),
    getRecentLogs(employee.id, employee.role),
  ]);

  const roleLabel = ROLE_LABEL[employee.role] ?? employee.role;

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

  const isTech = employee.role === "TECHNICIAN" || employee.role === "EXPERT_REPAIR";

  const summaryCards = [
    {
      label: "전체 접수건",
      value: stats.totalTickets,
      icon: ClipboardList,
      bg: "bg-blue-50",
      iconColor: "text-blue-600",
      textColor: "text-blue-900",
      href: "/tickets",
    },
    {
      label: isTech ? "배정된 신규" : "신규 접수",
      value: isTech ? stats.myNewCount : (stats.statusCounts["NEW"] ?? 0),
      icon: PlusCircle,
      bg: "bg-sky-50",
      iconColor: "text-sky-600",
      textColor: "text-sky-900",
      href: isTech
        ? `/tickets?status=ASSIGNED&assignee=${employee.id}`
        : "/tickets?status=NEW",
    },
    {
      label: isTech ? "내 수리 진행" : "수리 진행 중",
      value: isTech ? stats.myInProgressCount : (stats.statusCounts["IN_PROGRESS"] ?? 0),
      icon: Wrench,
      bg: "bg-yellow-50",
      iconColor: "text-yellow-600",
      textColor: "text-yellow-900",
      href: isTech
        ? `/tickets?status=IN_PROGRESS&assignee=${employee.id}`
        : "/tickets?status=IN_PROGRESS",
    },
    {
      label: "승인 대기",
      value: stats.statusCounts["WAITING_APPROVAL"] ?? 0,
      icon: Clock,
      bg: "bg-orange-50",
      iconColor: "text-orange-600",
      textColor: "text-orange-900",
      href: "/tickets?status=WAITING_APPROVAL",
    },
    {
      label: "이달 완료",
      value: stats.statusCounts["COMPLETED"] ?? 0,
      icon: CheckCircle2,
      bg: "bg-green-50",
      iconColor: "text-green-600",
      textColor: "text-green-900",
      href: `/tickets?status=COMPLETED&startDate=${monthStart}&endDate=${monthEnd}`,
    },
  ];

  const financeCards = [
    {
      label: "이달 예상 매출",
      value: `${stats.monthlyRevenue.toLocaleString()}원`,
      icon: Banknote,
      bg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      textColor: "text-indigo-900",
    },
    {
      label: "이달 예상 수익",
      value: `${stats.monthlyProfit.toLocaleString()}원`,
      icon: TrendingUp,
      bg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      textColor: "text-emerald-900",
    },
  ];

  const totalReceipts = Object.values(stats.receiptTypeCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">
      {/* 환영 인사 */}
      <div>
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

      {/* 접수건 통계 카드 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className={`flex items-center gap-4 rounded-xl border border-gray-200 p-4 shadow-sm transition-shadow hover:shadow-md ${card.bg}`}
            >
              <div className={`rounded-lg p-2.5 ${card.bg}`}>
                <Icon className={`h-6 w-6 ${card.iconColor}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">{card.label}</p>
                <p className={`text-2xl font-bold tabular-nums ${card.textColor}`}>
                  {card.value}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 매출/수익 + 접수 방식 */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 매출/수익 카드 */}
        <div className="grid gap-4 lg:col-span-1">
          {financeCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={`flex items-center gap-4 rounded-xl border border-gray-200 p-5 shadow-sm ${card.bg}`}
              >
                <div className={`rounded-lg p-2.5 ${card.bg}`}>
                  <Icon className={`h-6 w-6 ${card.iconColor}`} />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500">{card.label}</p>
                  <p className={`text-xl font-bold tabular-nums ${card.textColor}`}>
                    {card.value}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* 접수 방식별 비율 */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-gray-800">접수 방식별 비율</h2>
          {totalReceipts === 0 ? (
            <p className="text-sm text-gray-400">아직 접수 데이터가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(RECEIPT_LABEL).map(([key, { label, icon: RIcon }]) => {
                const count = stats.receiptTypeCounts[key] ?? 0;
                const pct = totalReceipts > 0 ? Math.round((count / totalReceipts) * 100) : 0;
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 font-medium text-gray-700">
                        <RIcon className="h-4 w-4 text-gray-400" />
                        {label}
                      </span>
                      <span className="tabular-nums text-gray-500">
                        {count}건 ({pct}%)
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-gray-100">
                      <div
                        className="h-2.5 rounded-full bg-blue-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 최근 활동 내역 */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-gray-500" />
          <h2 className="text-base font-semibold text-gray-800">최근 활동 내역</h2>
        </div>
        {recentLogs.length === 0 ? (
          <p className="text-sm text-gray-400">아직 기록된 활동이 없습니다.</p>
        ) : (
          <ol className="relative border-l-2 border-gray-200 pl-6 space-y-4">
            {recentLogs.map((log) => (
              <li key={log.id} className="relative">
                <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-blue-500 bg-white" />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-gray-500">
                  <span className="font-semibold text-gray-700">{log.employee_name}</span>
                  <Link
                    href={`/tickets/${log.ticket_id}`}
                    className="font-mono text-blue-600 hover:underline"
                  >
                    {log.ticket_id.slice(0, 8)}...
                  </Link>
                  <time>{formatDate(log.created_at)}</time>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-900">{log.message}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
