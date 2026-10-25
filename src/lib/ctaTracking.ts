import { canonicalBrandSlug } from "@/lib/brands";

/**
 * 대고객 페이지 CTA 클릭 계측 (랜딩 개편 Phase 0)
 *
 * 브라우저에서 /api/cta 로 이벤트 1건을 보낸다. sendBeacon 을 써서
 * tel: / 카카오톡 링크로 페이지를 떠나는 순간에도 전송이 끊기지 않게 한다.
 * 저장: public.cta_click_events (supabase/migrations/20261026090000_cta_click_events.sql)
 */

export const CTA_EVENT_TYPES = ["phone", "kakao", "contact", "form_submit"] as const;
export type CtaEventType = (typeof CTA_EVENT_TYPES)[number];

export interface CtaEventPayload {
  eventType: CtaEventType;
  location: string;
  pagePath: string;
  brandSlug: string | null;
  device: "mobile" | "desktop";
  sessionId: string | null;
  adSource: string | null;
  adKeyword: string | null;
  referrerHost: string | null;
}

const SESSION_KEY = "dr_cta_session";
const LANDING_KEY = "dr_cta_landing";

interface LandingInfo {
  adSource: string | null;
  adKeyword: string | null;
  referrerHost: string | null;
}

/** 링크 href 로 CTA 종류를 판별. 계측 대상이 아니면 null. */
export function classifyHref(href: string): CtaEventType | null {
  if (href.startsWith("tel:")) return "phone";
  if (/kakao\.com/i.test(href)) return "kakao";
  if (href === "#contact" || href.endsWith("/#contact")) return "contact";
  return null;
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // 시크릿 모드 등에서 저장 불가 — 계측은 계속 진행
  }
}

function getSessionId(): string | null {
  const existing = readSession(SESSION_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeSession(SESSION_KEY, id);
  return readSession(SESSION_KEY);
}

/**
 * 탭에서 처음 들어온 페이지의 유입 정보를 기억한다.
 * 광고로 들어와 페이지 안에서 이동한 뒤 클릭해도 광고 유입으로 집계되도록.
 */
export function rememberLanding() {
  if (readSession(LANDING_KEY)) return;
  const params = new URLSearchParams(window.location.search);
  const adSource =
    params.get("utm_source") ??
    (params.has("NaPm") || params.has("n_media") ? "naver_ad" : null) ??
    (params.has("gclid") ? "google_ad" : null);
  const adKeyword =
    params.get("n_keyword") ?? params.get("n_query") ?? params.get("utm_term");
  let referrerHost: string | null = null;
  try {
    const ref = document.referrer ? new URL(document.referrer).host : "";
    referrerHost = ref && ref !== window.location.host ? ref : null;
  } catch {
    referrerHost = null;
  }
  const info: LandingInfo = {
    adSource: adSource?.slice(0, 100) ?? null,
    adKeyword: adKeyword?.slice(0, 100) ?? null,
    referrerHost,
  };
  writeSession(LANDING_KEY, JSON.stringify(info));
}

function getLanding(): LandingInfo {
  const raw = readSession(LANDING_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as LandingInfo;
    } catch {
      // 손상된 값은 무시
    }
  }
  return { adSource: null, adKeyword: null, referrerHost: null };
}

export function trackCta(eventType: CtaEventType, location: string) {
  const pagePath = window.location.pathname;
  const firstSegment = pagePath.split("/").filter(Boolean)[0] ?? "";
  const payload: CtaEventPayload = {
    eventType,
    location: location.slice(0, 40) || "unknown",
    pagePath: pagePath.slice(0, 200),
    brandSlug: canonicalBrandSlug(firstSegment),
    device: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
    sessionId: getSessionId(),
    ...getLanding(),
  };

  const body = JSON.stringify(payload);
  const sent =
    typeof navigator.sendBeacon === "function" &&
    navigator.sendBeacon("/api/cta", new Blob([body], { type: "application/json" }));
  if (!sent) {
    void fetch("/api/cta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}
