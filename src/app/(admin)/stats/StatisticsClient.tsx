"use client";

import { useState, useTransition } from "react";
import {
  BarChart,
  Bar,
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
  IntakeStatsData,
  TechnicianRevenueData,
  TechnicianPerformanceData,
  BrandBreakdownData,
  StatusBreakdownData,
  ReceiptTypeBreakdownData,
  CancelStatsData,
} from "@/app/actions/statisticsActions";
import {
  getAnnualRevenue,
  getIntakeStats,
  getTechnicianMonthlyRevenue,
  getTechnicianPerformance,
  getStatusBreakdown,
  getReceiptTypeBreakdown,
  getCancelStats,
} from "@/app/actions/statisticsActions";

interface Props {
  annualRevenue: MonthlyRevenueData[];
  intakeStats: IntakeStatsData;
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

// 매출·자재비·순매출을 함께 그리는 차트용 (시리즈 이름은 Bar의 name을 그대로 사용)
const amountTooltipFormatter = (value: unknown, name: unknown) => [
  `${Number(value ?? 0).toLocaleString()}원`,
  String(name ?? ""),
];

export function StatisticsClient({
  annualRevenue: initialAnnualRevenue,
  intakeStats: initialIntakeStats,
  techRevenue: initialTechRevenue,
  techPerformance: initialTechPerformance,
  brandBreakdown: initialBrandBreakdown,
  statusBreakdown: initialStatusBreakdown,
  receiptTypeBreakdown: initialReceiptTypeBreakdown,
  cancelStats: initialCancelStats,
  currentYear,
  currentMonth,
}: Props) {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const [annualRevenue, setAnnualRevenue] = useState(initialAnnualRevenue);
  const [intakeStats, setIntakeStats] = useState(initialIntakeStats);
  const [techRevenue, setTechRevenue] = useState(initialTechRevenue);
  const [techPerformance, setTechPerformance] = useState(initialTechPerformance);
  const [brandBreakdown, setBrandBreakdown] = useState(initialBrandBreakdown);
  const [statusBreakdown, setStatusBreakdown] = useState(initialStatusBreakdown);
  const [receiptTypeBreakdown, setReceiptTypeBreakdown] = useState(initialReceiptTypeBreakdown);
  const [cancelStats, setCancelStats] = useState(initialCancelStats);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 조회 실패(로그인 만료·권한 없음) 시 이전 기간과 데이터를 그대로 두고 메시지만 표시한다
  async function fetchData(year: number, month: number, prevYear: number, prevMonth: number) {
    startTransition(async () => {
      const [
        newAnnual,
        newIntake,
        newTechRevenue,
        newTechPerf,
        newStatus,
        newReceiptType,
        newCancel,
      ] = await Promise.all([
        getAnnualRevenue(year),
        getIntakeStats(year, month),
        getTechnicianMonthlyRevenue(year, month),
        getTechnicianPerformance(year, month),
        getStatusBreakdown(year, month),
        getReceiptTypeBreakdown(year, month),
        getCancelStats(year, month),
      ]);
      if (
        "error" in newAnnual || "error" in newIntake || "error" in newTechRevenue || "error" in newTechPerf ||
        "error" in newStatus || "error" in newReceiptType || "error" in newCancel
      ) {
        const failed = [newAnnual, newIntake, newTechRevenue, newTechPerf, newStatus, newReceiptType, newCancel].find(
          (r) => "error" in r
        );
        setError(failed && "error" in failed ? failed.error : "통계를 불러오지 못했습니다.");
        setSelectedYear(prevYear);
        setSelectedMonth(prevMonth);
        return;
      }
      setError(null);
      setAnnualRevenue(newAnnual.data);
      setIntakeStats(newIntake.data);
      setTechRevenue(newTechRevenue.data);
      setTechPerformance(newTechPerf.data);
      setStatusBreakdown(newStatus.data);
      setReceiptTypeBreakdown(newReceiptType.data);
      setCancelStats(newCancel.data);
    });
  }

  function handleYearChange(year: number) {
    setSelectedYear(year);
    fetchData(year, selectedMonth, selectedYear, selectedMonth);
  }

  function handleMonthChange(month: number) {
    setSelectedMonth(month);
    fetchData(selectedYear, month, selectedYear, selectedMonth);
  }

  const totalAnnual = annualRevenue.reduce((s, d) => s + d.revenue, 0);
  // 선택 월 매출·자재비·순매출 (완료월 기준, 완료 후 추가된 비용 포함)
  const selectedMonthData = annualRevenue.find((d) => d.month === selectedMonth);
  const totalMonthly = selectedMonthData?.revenue ?? 0;
  const monthlyCost = selectedMonthData?.cost ?? 0;
  const monthlyProfit = selectedMonthData?.profit ?? 0;
  const annualProfit = annualRevenue.reduce((s, d) => s + d.profit, 0);
  // 순매출 과세 구분 (연간 / 선택 월)
  const taxSplitRows = [
    { label: "계좌이체 · 증빙 미발급", key: "unissued", className: "text-rose-600" },
    { label: "계좌이체 · 발급 여부 미확인", key: "unknown", className: "text-amber-600" },
    { label: "과세대상", key: "taxable", className: "text-gray-900" },
  ] as const;
  const totalIntakeThisMonth = intakeStats.daily.reduce((s, d) => s + d.count, 0);
  const totalTickets = statusBreakdown.reduce((s, d) => s + d.count, 0);

  // Generate year options: current year -3 to current year
  const yearOptions = Array.from({ length: 4 }, (_, i) => currentYear - 3 + i);

  return (
    <div className="space-y-6">
      {/* 연/월 선택 UI */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <span className="text-sm font-medium text-gray-600">조회 기간</span>
        <div className="flex items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            disabled={isPending}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={(e) => handleMonthChange(Number(e.target.value))}
            disabled={isPending}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}월
              </option>
            ))}
          </select>
        </div>
        {isPending && (
          <span className="flex items-center gap-1.5 text-xs text-blue-500">
            <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            로딩 중…
          </span>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* 로딩 오버레이 래퍼 */}
      <div className={`space-y-6 transition-opacity duration-200 ${isPending ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
        {/* 요약 카드 */}
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard
            label={`${selectedYear}년 연간 매출`}
            value={formatWonFull(totalAnnual)}
            color="blue"
          />
          <SummaryCard
            label={`${selectedYear}년 ${selectedMonth}월 매출`}
            value={formatWonFull(totalMonthly)}
            color="green"
          />
          <SummaryCard
            label={`${selectedMonth}월 자재비`}
            value={formatWonFull(monthlyCost)}
            color="orange"
          />
          <SummaryCard
            label={`${selectedYear}년 연간 순매출`}
            value={formatWonFull(annualProfit)}
            color="teal"
          />
          <SummaryCard
            label={`${selectedMonth}월 순매출`}
            value={formatWonFull(monthlyProfit)}
            color="teal"
          />
          <SummaryCard
            label={`${selectedMonth}월 접수 건수`}
            value={`${totalTickets.toLocaleString()}건`}
            color="purple"
          />
        </div>

        {/* 섹션 1: 매출 추이 */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 연간 월별 매출 */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-gray-900">
              {selectedYear}년 월별 매출·순매출 추이
            </h2>
            <p className="mb-4 text-xs text-gray-400">수리 완료월 기준 · 순매출 = 실매출 − 자재비(완료 후 추가 비용 포함)</p>
            {totalAnnual === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={annualRevenue} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={formatWon} tick={{ fontSize: 11 }} width={48} />
                  <Tooltip formatter={amountTooltipFormatter as never} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="매출" />
                  <Bar dataKey="cost" fill="#f97316" radius={[4, 4, 0, 0]} name="자재비" />
                  <Bar dataKey="profit" fill="#14b8a6" radius={[4, 4, 0, 0]} name="순매출" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 선택 월 일별 접수 건수 */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-gray-900">
              {selectedMonth}월 일별 접수 건수
            </h2>
            <p className="mb-4 text-xs text-gray-400">
              접수일 기준 · 총 {totalIntakeThisMonth.toLocaleString()}건
            </p>
            {totalIntakeThisMonth === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={intakeStats.daily} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                  <Tooltip formatter={(value: unknown) => [`${Number(value ?? 0)}건`, "접수 건수"] as never} />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="접수 건수" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 섹션 1-1: 순매출 과세 구분 + 접수 대비 입고율 */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 순매출 과세 구분 */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-gray-900">순매출 과세 구분</h2>
            <p className="mb-4 text-xs text-gray-400">
              수리 완료월 기준 · 증빙 = 현금영수증·세금계산서 · 카드·간편결제는 과세대상
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-gray-500">
                    <th className="py-2 pr-4">구분</th>
                    <th className="py-2 pr-4 text-right">{selectedYear}년 연간</th>
                    <th className="py-2 text-right">{selectedMonth}월</th>
                  </tr>
                </thead>
                <tbody>
                  {taxSplitRows.map((row) => (
                    <tr key={row.key} className="border-b">
                      <td className="py-2 pr-4 text-gray-800">{row.label}</td>
                      <td className={`py-2 pr-4 text-right tabular-nums font-medium ${row.className}`}>
                        {formatWonFull(annualRevenue.reduce((s, d) => s + d[row.key], 0))}
                      </td>
                      <td className={`py-2 text-right tabular-nums font-medium ${row.className}`}>
                        {formatWonFull(selectedMonthData?.[row.key] ?? 0)}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 pr-4 font-semibold text-gray-900">순매출 합계</td>
                    <td className="py-2 pr-4 text-right tabular-nums font-semibold text-teal-700">
                      {formatWonFull(annualProfit)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold text-teal-700">
                      {formatWonFull(monthlyProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              미확인 = 발급 여부 입력 기능 도입 전(2026년 9월 이전) 완료된 계좌이체 건
            </p>
          </div>

          {/* 접수 대비 입고율 */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-base font-semibold text-gray-900">접수건 대비 입고율</h2>
            <p className="mb-4 text-xs text-gray-400">
              접수일 기준 · 입고 후 취소된 건도 입고로 집계
            </p>
            <div className="grid grid-cols-2 gap-4">
              {([
                { label: `${selectedYear}년 연간 입고율`, v: intakeStats.annual },
                { label: `${selectedMonth}월 입고율`, v: intakeStats.monthly },
              ]).map(({ label, v }) => (
                <div key={label} className="rounded-lg bg-gray-50 p-4 text-center">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="mt-1 text-3xl font-bold text-teal-600">{v.rate}%</p>
                  <p className="mt-1 text-xs text-gray-400">
                    입고 {v.received.toLocaleString()}건 / 접수 {v.total.toLocaleString()}건
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 섹션 2: 기사별 선택 월 매출 */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">
            {selectedMonth}월 기사별 매출 현황
          </h2>
          <p className="mb-4 text-xs text-gray-400">선택 월 완료 처리 기준</p>
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
            {selectedYear}년 {selectedMonth}월 완료 기준 · 순매출 = 실매출 − 자재비 · 추가수익 = 확정견적 − 최소견적 합산
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
                    <th className="py-3 pr-4 text-right">자재비</th>
                    <th className="py-3 pr-4 text-right">순매출</th>
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
                      <td className="py-3 pr-4 text-right text-orange-600">
                        {row.totalCost.toLocaleString()}원
                      </td>
                      <td className="py-3 pr-4 text-right font-medium text-teal-700">
                        {row.netProfit.toLocaleString()}원
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
            <p className="mb-4 text-xs text-gray-400">
              {selectedYear}년 {selectedMonth}월 접수 기준
            </p>
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
            <p className="mb-4 text-xs text-gray-400">
              {selectedYear}년 {selectedMonth}월 · 입고 전/후 취소 구분
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-gray-50 p-4 text-center">
                <p className="text-xs text-gray-500">전체 취소율</p>
                <p className="mt-1 text-3xl font-bold text-red-500">{cancelStats.totalRate}%</p>
                <p className="mt-1 text-xs text-gray-400">
                  취소 {cancelStats.totalCanceled.toLocaleString()}건 / 접수 대비
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4 text-center">
                <p className="text-xs text-gray-500">입고 전 취소율</p>
                <p className="mt-1 text-3xl font-bold text-amber-500">{cancelStats.preReceiptRate}%</p>
                <p className="mt-1 text-xs text-gray-400">
                  {cancelStats.preReceiptCanceled.toLocaleString()}건 / 전체 접수 대비
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4 text-center">
                <p className="text-xs text-gray-500">입고 후 취소율</p>
                <p className="mt-1 text-3xl font-bold text-orange-500">{cancelStats.postReceiptRate}%</p>
                <p className="mt-1 text-xs text-gray-400">
                  {cancelStats.postReceiptCanceled.toLocaleString()}건 / 입고 {cancelStats.receivedCount.toLocaleString()}건 대비
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 섹션 5: 담당기사별 취소율 */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-base font-semibold text-gray-900">담당기사별 취소율</h2>
          <p className="mb-4 text-xs text-gray-400">
            {selectedYear}년 {selectedMonth}월 배정 티켓 기준 취소율
          </p>
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
            <h2 className="mb-1 text-base font-semibold text-gray-900">티켓 상태 비율</h2>
            <p className="mb-4 text-xs text-gray-400">
              {selectedYear}년 {selectedMonth}월 접수 {totalTickets.toLocaleString()}건 기준
            </p>
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
  color: "blue" | "green" | "purple" | "orange" | "teal";
}) {
  const colorMap = {
    blue: "bg-blue-50 border-blue-100",
    green: "bg-emerald-50 border-emerald-100",
    purple: "bg-purple-50 border-purple-100",
    orange: "bg-orange-50 border-orange-100",
    teal: "bg-teal-50 border-teal-100",
  };
  const textMap = {
    blue: "text-blue-700",
    green: "text-emerald-700",
    purple: "text-purple-700",
    orange: "text-orange-700",
    teal: "text-teal-700",
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
