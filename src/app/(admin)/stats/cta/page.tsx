import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { getCtaStats, type CtaBreakdownRow, type CtaStatsData } from "@/app/actions/ctaStatsActions";

const PERIODS = [7, 30, 90] as const;

/** 클릭 위치 코드 → 화면 표시명 */
const LOCATION_LABEL: Record<string, string> = {
  header: "상단 헤더",
  hero: "메인 히어로",
  "brand-intro": "브랜드 히어로",
  process: "수리 과정 섹션",
  footer: "푸터",
  mobile_cta: "모바일 하단 고정바",
  contact_form: "접수폼 (제출 완료)",
};

interface PageProps {
  searchParams: Promise<{ days?: string }>;
}

export default async function CtaStatsPage({ searchParams }: PageProps) {
  const employee = await getCurrentEmployee();
  if (!employee || (employee.role !== "ADMIN" && employee.role !== "MANAGER")) {
    redirect("/dashboard");
  }

  const { days: daysParam } = await searchParams;
  const days = PERIODS.find((p) => String(p) === daysParam) ?? 30;
  const result = await getCtaStats(days);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">CTA 클릭 현황</h1>
          <p className="mt-1 text-sm text-gray-500">
            홈페이지·브랜드 랜딩의 전화 / 카카오톡 / 접수 버튼 클릭과 접수 완료 건수 (한국시간 기준 일별)
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-white p-1 shadow-sm">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/stats/cta?days=${p}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                p === days ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              최근 {p}일
            </Link>
          ))}
        </div>
      </div>

      {"error" in result ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{result.error}</p>
      ) : (
        <CtaStatsView data={result.data} />
      )}
    </div>
  );
}

function CtaStatsView({ data }: { data: CtaStatsData }) {
  const totals = data.daily.reduce(
    (acc, r) => ({
      phone: acc.phone + r.phone,
      kakao: acc.kakao + r.kakao,
      contact: acc.contact + r.contact,
      formSubmit: acc.formSubmit + r.formSubmit,
    }),
    { phone: 0, kakao: 0, contact: 0, formSubmit: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="전화 클릭" value={totals.phone} />
        <SummaryCard label="카카오톡 클릭" value={totals.kakao} />
        <SummaryCard label="접수 버튼 클릭" value={totals.contact} />
        <SummaryCard label="온라인 접수 완료" value={totals.formSubmit} />
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-900">일별 현황</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4 font-medium">날짜</th>
                <th className="py-2 pr-4 text-right font-medium">전화</th>
                <th className="py-2 pr-4 text-right font-medium">카톡</th>
                <th className="py-2 pr-4 text-right font-medium">접수 버튼</th>
                <th className="py-2 pr-4 text-right font-medium">접수 완료</th>
                <th className="py-2 pr-4 text-right font-medium">합계</th>
                <th className="py-2 pr-4 text-right font-medium">모바일 비율</th>
                <th className="py-2 text-right font-medium">클릭한 방문자</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((r) => {
                const total = r.phone + r.kakao + r.contact + r.formSubmit;
                return (
                  <tr key={r.day} className={`border-b last:border-0 ${total === 0 ? "text-gray-400" : "text-gray-800"}`}>
                    <td className="py-2 pr-4 tabular-nums">{r.day}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.phone}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.kakao}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.contact}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.formSubmit}</td>
                    <td className="py-2 pr-4 text-right font-semibold tabular-nums">{total}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {total > 0 ? `${Math.round((r.mobile / total) * 100)}%` : "-"}
                    </td>
                    <td className="py-2 text-right tabular-nums">{r.sessions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <BreakdownTable
          title="클릭 위치별"
          rows={data.byLocation}
          labelOf={(k) => LOCATION_LABEL[k] ?? k}
        />
        <BreakdownTable title="페이지별" rows={data.byPage} labelOf={(k) => k} />
        <BreakdownTable title="유입 경로별" rows={data.bySource} labelOf={(k) => k} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  labelOf,
}: {
  title: string;
  rows: CtaBreakdownRow[];
  labelOf: (key: string) => string;
}) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-900">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">기간 내 기록이 없습니다.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="whitespace-nowrap border-b text-left text-gray-500">
              <th className="py-2 pr-2 font-medium">항목</th>
              <th className="py-2 pr-2 text-right font-medium">전화</th>
              <th className="py-2 pr-2 text-right font-medium">카톡</th>
              <th className="py-2 pr-2 text-right font-medium">접수</th>
              <th className="py-2 text-right font-medium">완료</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b text-gray-800 last:border-0">
                <td className="max-w-[10rem] truncate py-2 pr-2" title={r.key}>{labelOf(r.key)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{r.phone}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{r.kakao}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{r.contact}</td>
                <td className="py-2 text-right tabular-nums">{r.formSubmit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
