import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import {
  getAnnualRevenue,
  getMonthlyDailyRevenue,
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

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [annualRevenue, dailyRevenue, techRevenue, techPerformance, brandBreakdown, statusBreakdown, receiptTypeBreakdown, cancelStats] =
    await Promise.all([
      getAnnualRevenue(currentYear),
      getMonthlyDailyRevenue(currentYear, currentMonth),
      getTechnicianMonthlyRevenue(currentYear, currentMonth),
      getTechnicianPerformance(currentYear, currentMonth),
      getBrandBreakdown(currentYear, currentMonth),
      getStatusBreakdown(currentYear, currentMonth),
      getReceiptTypeBreakdown(currentYear, currentMonth),
      getCancelStats(currentYear, currentMonth),
    ]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">통계 대시보드</h1>
        <p className="mt-1 text-sm text-gray-500">
          {currentYear}년 운영 현황 및 성과 분석
        </p>
      </div>

      <StatisticsClient
        annualRevenue={annualRevenue}
        dailyRevenue={dailyRevenue}
        techRevenue={techRevenue}
        techPerformance={techPerformance}
        brandBreakdown={brandBreakdown}
        statusBreakdown={statusBreakdown}
        receiptTypeBreakdown={receiptTypeBreakdown}
        cancelStats={cancelStats}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />
    </div>
  );
}
