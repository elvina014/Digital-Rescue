import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import ClickGuardClient from "./ClickGuardClient";
import { MIN_SCORES, PERIODS, type AdSummary, type NaverSource, type SuspectIp, type WhitelistRow } from "./shared";

/**
 * 부정클릭 감시 (Click Guard MVP 2/2) — ADMIN 전용.
 * 네이버 광고 유입을 IP별로 점수화해 보여주고, 관리자가 네이버 광고노출 제한에 등록(API)하거나 직접 등록한 뒤 수동 표시한다.
 * 조회는 로그인한 직원 세션으로 RPC를 호출한다(service role 금지, RPC 안에서 ADMIN 재확인).
 */

interface PageProps {
  searchParams: Promise<{ hours?: string; min?: string; tab?: string }>;
}

export default async function ClickGuardPage({ searchParams }: PageProps) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  if (employee.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const hours = PERIODS.find((p) => String(p.hours) === params.hours)?.hours ?? 24;
  const minScore = MIN_SCORES.find((s) => String(s) === params.min) ?? 60;
  const tab = params.tab === "whitelist" ? "whitelist" : "suspects";

  const supabase = await createClient();
  const [summaryRes, suspectsRes, whitelistRes, marksRes] = await Promise.all([
    supabase.rpc("cg_ad_summary", { p_hours: hours }),
    supabase.rpc("cg_suspect_ips", { p_hours: hours, p_min_score: minScore }),
    supabase.from("cg_whitelist").select("id, cidr, reason, created_at").order("created_at", { ascending: false }),
    supabase.from("cg_ip_marks").select("client_ip, naver_source").eq("status", "naver_blocked"),
  ]);
  const loadError = summaryRes.error ?? suspectsRes.error ?? whitelistRes.error ?? marksRes.error;
  // 네이버 등록완료 IP의 등록 구분 (api / manual)
  const naverSources: Record<string, NaverSource | null> = Object.fromEntries(
    (marksRes.data ?? []).map((m) => [String(m.client_ip), (m.naver_source as NaverSource | null) ?? null])
  );

  const query = (next: Record<string, string | number>) => {
    const sp = new URLSearchParams({ hours: String(hours), min: String(minScore), tab, ...Object.fromEntries(Object.entries(next).map(([k, v]) => [k, String(v)])) });
    return `/click-guard?${sp.toString()}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">부정클릭 감시</h1>
          <p className="mt-1 text-sm text-gray-500">
            네이버 파워링크 광고로 들어온 방문을 IP별로 점수화합니다. [네이버에 차단 등록]으로 광고노출 제한에 바로 등록하거나, 검색광고센터에서 직접 등록한 뒤 수동 표시해 주세요. (한국시간 기준)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1 rounded-lg border bg-white p-1 shadow-sm">
            {PERIODS.map((p) => (
              <Link
                key={p.hours}
                href={query({ hours: p.hours })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  p.hours === hours ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border bg-white p-1 shadow-sm">
            <span className="px-2 text-xs text-gray-500">최소 점수</span>
            {MIN_SCORES.map((s) => (
              <Link
                key={s}
                href={query({ min: s })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  s === minScore ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {s}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {[
          { key: "suspects", label: "의심 IP" },
          { key: "whitelist", label: "화이트리스트" },
        ].map((t) => (
          <Link
            key={t.key}
            href={query({ tab: t.key })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {loadError ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          부정클릭 감시 데이터를 불러오지 못했습니다. {loadError.code === "P0001" ? loadError.message : "잠시 후 다시 시도해 주세요."}
        </p>
      ) : (
        <ClickGuardClient
          tab={tab}
          summary={summaryRes.data as AdSummary}
          suspects={(suspectsRes.data ?? []) as SuspectIp[]}
          whitelist={(whitelistRes.data ?? []) as WhitelistRow[]}
          naverSources={naverSources}
        />
      )}
    </div>
  );
}
