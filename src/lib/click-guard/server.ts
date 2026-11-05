import type { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { isNaverAdLanding } from "@/lib/naver-ad/isNaverAdLanding";
import { CLOUDFLARE_IP_RANGES } from "./cloudflare-ips";
import { extractClientIp } from "./ip";
import { buildClickKey, deviceTypeOf, isBotUserAgent } from "./visit";

/**
 * Click Guard 서버 수집 (docs/click-guard/SPEC.md "MVP SPEC") — 서버 전용(service_role).
 *
 * - proxy: 광고 유입이면 cg_sid 쿠키 발급 + cg_record_visit (event.waitUntil, 응답 비차단)
 * - /api/cg/beacon, /api/cta: cg_record_engagement (after(), 응답 비차단)
 * 모든 경로는 fail-silent: 실패해도 페이지 응답·속도에 영향이 없어야 한다.
 */

export const CG_COOKIE = "cg_sid";
const CG_COOKIE_MAX_AGE = 1800; // 30분
const CG_TIMEOUT_MS = 1500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATIC_FILE_RE = /\.[a-z0-9]{1,8}$/i;

export function isClickGuardEnabled(): boolean {
  return process.env.CLICK_GUARD_ENABLED === "true" && process.env.VERCEL_ENV !== "preview";
}

export function isValidSessionId(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

function hostnameOf(host: string | null): string {
  return (host ?? "").split(":")[0].trim().toLowerCase();
}

function isAllowedHost(host: string | null): boolean {
  const hostname = hostnameOf(host);
  if (!hostname || hostname.startsWith("login.") || hostname.startsWith("edit.")) return false;
  const allowed = (process.env.CLICK_GUARD_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(hostname);
}

/** 수집 대상 요청인지: 설정·호스트·경로·문서 요청·광고 파라미터 */
function shouldTrack(request: NextRequest): boolean {
  if (!isClickGuardEnabled()) return false;
  if (request.method !== "GET") return false;
  if (!isAllowedHost(request.headers.get("host"))) return false;
  const { pathname, searchParams } = request.nextUrl;
  if (pathname.startsWith("/_next") || pathname.startsWith("/api") || STATIC_FILE_RE.test(pathname)) return false;
  // 브라우저 예측 프리페치는 방문이 아니다. (RSC 헤더·_rsc 는 Next가 proxy 전에 지워서 여기서는 구분할 수 없다 —
  // 사이트 안 링크에는 광고 파라미터가 없으므로 클라이언트 이동이 광고 유입으로 잡히지는 않는다)
  const purpose = `${request.headers.get("sec-purpose") ?? ""} ${request.headers.get("purpose") ?? ""}`;
  if (/prefetch/i.test(purpose)) return false;
  return isNaverAdLanding(searchParams);
}

async function callRpc(fn: string, args: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .rpc(fn, args)
      .abortSignal(AbortSignal.timeout(CG_TIMEOUT_MS));
    if (error) console.warn(`[click-guard] ${fn} failed:`, error.message);
  } catch (e) {
    console.warn(`[click-guard] ${fn} failed:`, e instanceof Error ? e.message : e);
  }
}

/**
 * proxy 응답 직전 훅. 기존 라우팅 결과(response)는 그대로 두고, 광고 유입이면 쿠키만 붙인다.
 * 리다이렉트 응답은 이동한 쪽에서 다시 기록되므로 건너뛴다.
 */
export function applyClickGuard(request: NextRequest, event: NextFetchEvent, response: NextResponse): NextResponse {
  try {
    if (response.status >= 300 || !shouldTrack(request)) return response;

    const existing = request.cookies.get(CG_COOKIE)?.value;
    const sessionId = isValidSessionId(existing) ? existing : crypto.randomUUID();
    response.cookies.set(CG_COOKIE, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: CG_COOKIE_MAX_AGE,
    });

    const h = request.headers;
    const q = request.nextUrl.searchParams;
    const ip = extractClientIp((name) => h.get(name), CLOUDFLARE_IP_RANGES);
    const userAgent = h.get("user-agent");
    const payload = {
      session_id: sessionId,
      click_key: buildClickKey({ napm: q.get("NaPm"), sessionId, nAd: q.get("n_ad"), nowMs: Date.now() }),
      client_ip: ip.clientIp,
      ip_version: ip.ipVersion,
      ip_prefix: ip.ipPrefix,
      raw_ip_headers: ip.rawHeaders,
      user_agent: userAgent,
      is_bot: isBotUserAgent(userAgent),
      device_type: deviceTypeOf(userAgent),
      host: hostnameOf(h.get("host")),
      path: request.nextUrl.pathname,
      n_media: q.get("n_media"),
      n_query: q.get("n_query"),
      n_rank: q.get("n_rank"),
      n_ad_group: q.get("n_ad_group"),
      n_ad: q.get("n_ad"),
      n_keyword_id: q.get("n_keyword_id"),
      n_keyword: q.get("n_keyword"),
      n_campaign_type: q.get("n_campaign_type"),
      n_match: q.get("n_match"),
      napm: q.get("NaPm"),
      referer: h.get("referer"),
      country: h.get("x-vercel-ip-country"),
    };
    event.waitUntil(callRpc("cg_record_visit", { payload }));
  } catch (e) {
    console.warn("[click-guard] proxy hook failed:", e instanceof Error ? e.message : e);
  }
  return response;
}

export interface EngagementInput {
  dwellMs?: number | null;
  maxScrollPct?: number | null;
  interactions?: number | null;
  pageview?: boolean;
  /** 기존 CTA 명칭 (phone / kakao / contact / form_submit) */
  conversion?: string | null;
}

/** 세션 참여도 갱신. 호출 쪽은 after() 안에서 부른다 (응답 비차단). 실패해도 throw 하지 않는다. */
export async function recordEngagement(sessionId: string | null | undefined, input: EngagementInput): Promise<void> {
  if (!isClickGuardEnabled() || !isValidSessionId(sessionId)) return;
  await callRpc("cg_record_engagement", {
    p_session_id: sessionId,
    p_dwell_ms: input.dwellMs ?? null,
    p_max_scroll_pct: input.maxScrollPct ?? null,
    p_interactions: input.interactions ?? null,
    p_pageview: input.pageview ?? false,
    p_conversion: input.conversion ?? null,
  });
}
