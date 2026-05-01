"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type {
  MonthlyRevenueData,
  DailyRevenueData,
  TechnicianRevenueData,
  TechnicianPerformanceData,
  BrandBreakdownData,
  StatusBreakdownData,
  ReceiptTypeBreakdownData,
  CancelStatsData,
} from "@/app/actions/statisticsActions";

interface Props {
  annualRevenue: MonthlyRevenueData[];
  dailyRevenue: DailyRevenueData[];
  techRevenue: TechnicianRevenueData[];
  techPerformance: TechnicianPerformanceData[];
  brandBreakdown: BrandBreakdownData[];
  statusBreakdown: StatusBreakdownData[];
  receiptTypeBreakdown: ReceiptTypeBreakdownData[];
  cancelStats: CancelStatsData;
  currentYear: number;
  currentMonth: number;
}

function formatWon(value: number | string) {
  const n = Number(value);
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return `${n.toLocaleString()}`;
}

function formatWonFull(value: number) {
  return `${value.toLocaleString()}원`;
}

const revenueTooltipFormatter = (value: unknown) => [
  `${Number(value ?? 0).toLocaleString()}원`,
  "매출",
];

export function StatisticsClient({
  annualRevenue,
  dailyRevenue,
  techRevenue,
  techPerformance,
  brandBreakdown,
  statusBreakdown,
  receiptTypeBreakdown,
  cancelStats,
  currentYear,
  currentMonth,
}: Props) {
  const totalAnnual = annualRevenue.reduce((s, d) => s + d.revenue, 0);
  const totalMonthly = dailyRevenue.reduce((s, d) => s + d.revenue, 0);
  const totalTickets = statusBreakdown.reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label={`${currentYear}년 연간 매출`}
          value={formatWonFull(totalAnnual)}
          color="blue"
        />
        <SummaryCard
          label={`${currentMonth}월 월간 매출`}
          value={formatWonFull(totalMonthly)}
          color="green"
        />
        <SummaryCard
          label="전체 접수 건수"
          value={`${totalTickets.toLocaleString()}건`}
          color="purple"
        />
      </div>

      {/* 섹션 1: 매출 추이 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 연간 월별 매출 */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">
            {currentYear}년 월별 매출 추이
          </h2>
          <p className="mb-4 text-xs text-gray-400">수리 완료 기준 final_price 합산</p>
          {totalAnnual === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={annualRevenue} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={formatWon} tick={{ fontSize: 11 }} width={48} />
                <Tooltip formatter={revenueTooltipFormatter as never} />
                <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="매출" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 이번 달 일별 매출 */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">
            {currentMonth}월 일별 매출 흐름
          </h2>
          <p className="mb-4 text-xs text-gray-400">이번 달 일자별 완료 매출</p>
          {totalMonthly === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyRevenue} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} />
                <YAxis tickFormatter={formatWon} tick={{ fontSize: 11 }} width={48} />
                <Tooltip formatter={revenueTooltipFormatter as never} />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="매출"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* 섹션 2: 기사별 이번 달 매출 */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">
          {currentMonth}월 기사별 매출 현황
        </h2>
        <p className="mb-4 text-xs text-gray-400">이번 달 완료 처리 기준</p>
        {techRevenue.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, techRevenue.length * 52)}>
            <BarChart
              data={techRevenue}
              layout="vertical"
              margin={{ top: 4, right: 80, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tickFormatter={formatWon} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 13 }} width={72} />
              <Tooltip
                formatter={(value: unknown) => [
                  `${Number(value ?? 0).toLocaleString()}원`,
                  "매출",
                ] as never}
              />
              <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} name="매출">
                {techRevenue.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={index === 0 ? "#7c3aed" : index === 1 ? "#8b5cf6" : "#a78bfa"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 섹션 3: 기사별 최소견적 대비 성과 */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">
          기사별 최소견적 대비 성과 ⭐
        </h2>
        <p className="mb-4 text-xs text-gray-400">
          완료 전체 기간 기준 · 추가수익 = 확정견적 − 최소견적 합산
        </p>
        {techPerformance.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-gray-500">
                  <th className="py-3 pr-4">기사 이름</th>
                  <th className="py-3 pr-4 text-right">완료 건수</th>
                  <th className="py-3 pr-4 text-right">총매출</th>
                  <th className="py-3 pr-4 text-right">추가수익액</th>
                  <th className="py-3 text-right">추가수익 건수</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {techPerformance.map((row, i) => (
                  <tr key={row.technicianId} className="hover:bg-gray-50">
                    <td className="py-3 pr-4 font-medium text-gray-900">
                      {i === 0 && (
                        <span className="mr-1.5 inline-block rounded bg-yellow-100 px-1.5 py-0.5 text-xs font-semibold text-yellow-700">
                          TOP
                        </span>
                      )}
                      {row.name}
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-600">
                      {row.completedCount.toLocaleString()}건
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-700">
                      {row.totalRevenue.toLocaleString()}원
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold text-emerald-600">
                      +{row.upsellAmount.toLocaleString()}원
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      {row.upsellCount.toLocaleString()}건
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 섹션 4: 접수 방식별 비율 + 취소율 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 접수 방식별 비율 */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">접수 방식별 비율</h2>
          <p className="mb-4 text-xs text-gray-400">전체 접수 기준</p>
          {receiptTypeBreakdown.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={receiptTypeBreakdown}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(props) => {
                    const p = props as { name?: string; percent?: number };
                    return `${p.name ?? ""} ${((p.percent ?? 0) * 100).toFixed(0)}%`;
                  }}
                  labelLine={true}
                >
                  {receiptTypeBreakdown.map((_, index) => (
                    <Cell
                      key={`receipt-${index}`}
                      fill={["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"][index % 4]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value: unknown) => [`${Number(value ?? 0)}건`, "건수"] as never} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 취소율 요약 */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">취소율 분석</h2>
          <p className="mb-4 text-xs text-gray-400">전체 대비 / 당월 접수 대비</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <p className="text-xs text-gray-500">전체 취소율</p>
              <p className="mt-1 text-3xl font-bold text-red-500">{cancelStats.totalRate}%</p>
              <p className="mt-1 text-xs text-gray-400">
                취소 {cancelStats.totalCanceled.toLocaleString()}건
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4 text-center">
              <p className="text-xs text-gray-500">당월 취소율</p>
              <p className="mt-1 text-3xl font-bold text-orange-500">{cancelStats.monthlyRate}%</p>
              <p className="mt-1 text-xs text-gray-400">
                취소 {cancelStats.monthlyCanceled.toLocaleString()}건
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 섹션 5: 담당기사별 취소율 */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">담당기사별 취소율</h2>
        <p className="mb-4 text-xs text-gray-400">배정된 티켓 기준 취소율 (전체 / 당월)</p>
        {cancelStats.byTechnician.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-gray-500">
                  <th className="py-3 pr-4">기사 이름</th>
                  <th className="py-3 pr-4 text-right">전체 건수</th>
                  <th className="py-3 pr-4 text-right">전체 취소</th>
                  <th className="py-3 pr-4 text-right">전체 취소율</th>
                  <th className="py-3 pr-4 text-right">당월 건수</th>
                  <th className="py-3 pr-4 text-right">당월 취소</th>
                  <th className="py-3 text-right">당월 취소율</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cancelStats.byTechnician.map((row) => (
                  <tr key={row.technicianId} className="hover:bg-gray-50">
                    <td className="py-3 pr-4 font-medium text-gray-900">{row.name}</td>
                    <td className="py-3 pr-4 text-right text-gray-600">
                      {row.totalCount.toLocaleString()}건
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-600">
                      {row.canceledCount.toLocaleString()}건
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <span
                        className={
                          row.cancelRate >= 20
                            ? "font-semibold text-red-600"
                            : row.cancelRate >= 10
                            ? "font-semibold text-orange-500"
                            : "text-gray-700"
                        }
                      >
                        {row.cancelRate}%
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-600">
                      {row.monthlyTotal.toLocaleString()}건
                    </td>
                    <td className="py-3 pr-4 text-right text-gray-600">
                      {row.monthlyCanceled.toLocaleString()}건
                    </td>
                    <td className="py-3 text-right">
                      <span
                        className={
                          row.monthlyCancelRate >= 20
                            ? "font-semibold text-red-600"
                            : row.monthlyCancelRate >= 10
                            ? "font-semibold text-orange-500"
                            : "text-gray-700"
                        }
                      >
                        {row.monthlyCancelRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 섹션 6: 운영 인사이트 */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 브랜드별 접수 Top 5 */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">브랜드별 접수 Top 5</h2>
          <p className="mb-4 text-xs text-gray-400">전체 접수 기준</p>
          {brandBreakdown.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={brandBreakdown} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="brand" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                <Tooltip formatter={(value: unknown) => [`${Number(value ?? 0)}건`, "접수 건수"] as never} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} name="접수 건수">
                  {brandBreakdown.map((_, index) => (
                    <Cell
                      key={`brand-${index}`}
                      fill={["#3b82f6", "#06b6d4", "#8b5cf6", "#f59e0b", "#10b981"][index]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 상태별 비율 파이 차트 */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">현재 티켓 상태 비율</h2>
          <p className="mb-4 text-xs text-gray-400">전체 {totalTickets.toLocaleString()}건 기준</p>
          {statusBreakdown.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={statusBreakdown}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(props) => {
                    const p = props as { name?: string; percent?: number };
                    return `${p.name ?? ""} ${((p.percent ?? 0) * 100).toFixed(0)}%`;
                  }}
                  labelLine={true}
                >
                  {statusBreakdown.map((entry, index) => (
                    <Cell key={`status-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: unknown) => [`${Number(value ?? 0)}건`, "건수"] as never} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "blue" | "green" | "purple";
}) {
  const colorMap = {
    blue: "bg-blue-50 border-blue-100",
    green: "bg-emerald-50 border-emerald-100",
    purple: "bg-purple-50 border-purple-100",
  };
  const textMap = {
    blue: "text-blue-700",
    green: "text-emerald-700",
    purple: "text-purple-700",
  };
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${colorMap[color]}`}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${textMap[color]}`}>{value}</p>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[280px] items-center justify-center rounded-lg bg-gray-50">
      <p className="text-sm text-gray-400">데이터가 없습니다.</p>
    </div>
  );
}
