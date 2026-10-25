"use server";

import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { kstParts } from "@/lib/date";

/**
 * 대고객 페이지 CTA 클릭 현황 (랜딩 개편 Phase 0 기준선)
 * 원본: public.cta_click_events / 일별 집계: public.cta_daily_stats (한국시간 기준)
 * 조회 권한은 RLS 와 같이 ADMIN/MANAGER.
 */

export type CtaStatsResult<T> = { data: T } | { error: string };

export interface CtaDailyRow {
  day: string; // YYYY-MM-DD (KST)
  phone: number;
  kakao: number;
  contact: number;
  formSubmit: number;
  mobile: number;
  sessions: number;
}

export interface CtaBreakdownRow {
  key: string;
  phone: number;
  kakao: number;
  contact: number;
  formSubmit: number;
  total: number;
}

export interface CtaStatsData {
  days: number;
  daily: CtaDailyRow[];
  byLocation: CtaBreakdownRow[];
  byPage: CtaBreakdownRow[];
  bySource: CtaBreakdownRow[];
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 오늘(KST) 포함 최근 days일의 날짜 목록, 최신순 */
function recentKstDays(days: number): string[] {
  const { year, month, day } = kstParts(new Date());
  const todayUtc = Date.UTC(year, month - 1, day);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(todayUtc - i * 86_400_000);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  });
}

type EventRow = {
  event_type: string;
  location: string;
  page_path: string;
  ad_source: string | null;
};

function breakdown(rows: EventRow[], keyOf: (r: EventRow) => string): CtaBreakdownRow[] {
  const map = new Map<string, CtaBreakdownRow>();
  for (const r of rows) {
    const key = keyOf(r);
    const acc =
      map.get(key) ?? { key, phone: 0, kakao: 0, contact: 0, formSubmit: 0, total: 0 };
    if (r.event_type === "phone") acc.phone++;
    else if (r.event_type === "kakao") acc.kakao++;
    else if (r.event_type === "contact") acc.contact++;
    else if (r.event_type === "form_submit") acc.formSubmit++;
    acc.total++;
    map.set(key, acc);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export async function getCtaStats(days: number): Promise<CtaStatsResult<CtaStatsData>> {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "통계 조회 권한이 없습니다. (ADMIN/MANAGER만 가능)" };
  }

  const dayList = recentKstDays(days);
  const startDay = dayList[dayList.length - 1];
  const [sy, sm, sd] = startDay.split("-").map(Number);
  const startIso = new Date(Date.UTC(sy, sm - 1, sd) - KST_OFFSET_MS).toISOString();

  const supabase = await createClient();
  const [dailyRes, eventsRes] = await Promise.all([
    supabase.from("cta_daily_stats").select("*").gte("day", startDay),
    supabase
      .from("cta_click_events")
      .select("event_type, location, page_path, ad_source")
      .gte("created_at", startIso)
      .limit(50000),
  ]);

  if (dailyRes.error || eventsRes.error) {
    const msg = (dailyRes.error ?? eventsRes.error)!.message;
    console.error("[getCtaStats]", msg);
    return {
      error:
        "CTA 클릭 기록을 불러오지 못했습니다. cta_click_events 마이그레이션이 DB에 적용됐는지 확인해 주세요.",
    };
  }

  const byDay = new Map(
    (dailyRes.data ?? []).map((r) => [String(r.day), r as Record<string, number>])
  );
  const daily: CtaDailyRow[] = dayList.map((day) => {
    const r = byDay.get(day);
    return {
      day,
      phone: Number(r?.phone ?? 0),
      kakao: Number(r?.kakao ?? 0),
      contact: Number(r?.contact ?? 0),
      formSubmit: Number(r?.form_submit ?? 0),
      mobile: Number(r?.mobile ?? 0),
      sessions: Number(r?.sessions ?? 0),
    };
  });

  const events = (eventsRes.data ?? []) as EventRow[];
  return {
    data: {
      days,
      daily,
      byLocation: breakdown(events, (r) => r.location),
      byPage: breakdown(events, (r) => r.page_path),
      bySource: breakdown(events, (r) => r.ad_source ?? "(직접/기타)"),
    },
  };
}
