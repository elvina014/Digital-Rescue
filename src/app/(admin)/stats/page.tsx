import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { kstParts } from "@/lib/date";
import {
  getAnnualRevenue,
  getIntakeStats,
  getTechnicianMonthlyRevenue,
  getTechnicianPerformance,
  getBrandBreakdown,
  getStatusBreakdown,
  getReceiptTypeBreakdown,
  getCancelStats,
} from "@/app/actions/statisticsActions";
import { StatisticsClient } from "./StatisticsClient";

export default async function StatisticsPage() {
  const employee = await getCurrentEmployee();

  if (!employee || (employee.role !== "ADMIN" && employee.role !== "MANAGER")) {
    redirect("/dashboard");
  }

  // 서버(Vercel=UTC) 시간대와 무관하게 한국시간 기준 현재 연/월
  const { year: currentYear, month: currentMonth } = kstParts(new Date());

  const [annualRevenue, intakeStats, techRevenue, techPerformance, brandBreakdown, statusBreakdown, receiptTypeBreakdown, cancelStats] =
    await Promise.all([
      getAnnualRevenue(currentYear),
      getIntakeStats(currentYear, currentMonth),
      getTechnicianMonthlyRevenue(currentYear, currentMonth),
      getTechnicianPerformance(currentYear, currentMonth),
      getBrandBreakdown(),
      getStatusBreakdown(currentYear, currentMonth),
      getReceiptTypeBreakdown(currentYear, currentMonth),
      getCancelStats(currentYear, currentMonth),
    ]);

  // 위에서 ADMIN/MANAGER만 통과하므로 거부는 그 사이 세션·역할이 바뀐 경우뿐이다
  if (
    "error" in annualRevenue || "error" in intakeStats || "error" in techRevenue || "error" in techPerformance ||
    "error" in brandBreakdown || "error" in statusBreakdown || "error" in receiptTypeBreakdown ||
    "error" in cancelStats
  ) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">통계 대시보드</h1>
        <p className="mt-1 text-sm text-gray-500">
          {currentYear}년 운영 현황 및 성과 분석
        </p>
      </div>

      <StatisticsClient
        annualRevenue={annualRevenue.data}
        intakeStats={intakeStats.data}
        techRevenue={techRevenue.data}
        techPerformance={techPerformance.data}
        brandBreakdown={brandBreakdown.data}
        statusBreakdown={statusBreakdown.data}
        receiptTypeBreakdown={receiptTypeBreakdown.data}
        cancelStats={cancelStats.data}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />
    </div>
  );
}
