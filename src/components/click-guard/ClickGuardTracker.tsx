"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isNaverAdLanding } from "@/lib/naver-ad/isNaverAdLanding";

/**
 * Click Guard 참여도 트래커 (docs/click-guard/SPEC.md "MVP SPEC") — 대고객 레이아웃 전용.
 *
 * 탭에서 처음 연 URL이 네이버 광고 유입이면 sessionStorage 'cg_active' 를 켜고, 같은 탭에서는 계속 측정한다.
 * - 보이는 동안의 체류시간, 최대 스크롤(%), 상호작용(클릭·터치·키 입력) 횟수 — 탭 단위 누적값
 * - 화면이 가려질 때(visibilitychange hidden)·페이지를 떠날 때(pagehide) sendBeacon 으로 /api/cg/beacon 전송
 * - 라우트가 바뀔 때마다 pageview 1회 전송
 * 전환(전화·카톡·접수)은 기존 CtaTracker → /api/cta 가 처리하므로 여기서는 듣지 않는다.
 * 세션은 서버가 발급한 httpOnly 쿠키(cg_sid)로 식별된다. 모든 동작은 실패해도 조용히 넘어간다.
 */

const ACTIVE_KEY = "cg_active";
const STATE_KEY = "cg_state";
const ENDPOINT = "/api/cg/beacon";
const MAX_DWELL_MS = 86_400_000;
const MAX_INTERACTIONS = 100_000;

interface TrackerState {
  dwellMs: number;
  maxScrollPct: number;
  interactions: number;
}

function readStorage(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // 시크릿 모드 등 저장 불가 — 메모리 값으로 계속 진행
  }
}

function loadState(): TrackerState {
  try {
    const parsed = JSON.parse(readStorage(STATE_KEY) ?? "") as Partial<TrackerState>;
    return {
      dwellMs: Number(parsed.dwellMs) || 0,
      maxScrollPct: Number(parsed.maxScrollPct) || 0,
      interactions: Number(parsed.interactions) || 0,
    };
  } catch {
    return { dwellMs: 0, maxScrollPct: 0, interactions: 0 };
  }
}

function scrollPct(): number {
  const doc = document.documentElement;
  const total = doc.scrollHeight;
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round(((window.scrollY + window.innerHeight) / total) * 100)));
}

export function ClickGuardTracker() {
  const pathname = usePathname();
  const sendRef = useRef<((pageview: boolean) => void) | null>(null);
  const lastPageviewPath = useRef<string | null>(null);

  useEffect(() => {
    try {
      if (isNaverAdLanding(new URLSearchParams(window.location.search))) writeStorage(ACTIVE_KEY, "1");
      if (readStorage(ACTIVE_KEY) !== "1") return;
    } catch {
      return;
    }

    const state = loadState();
    let visibleSince: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let scrollQueued = false;

    const flush = () => {
      if (visibleSince !== null) {
        const now = performance.now();
        state.dwellMs += now - visibleSince;
        visibleSince = now;
      }
      writeStorage(STATE_KEY, JSON.stringify(state));
    };

    const send = (pageview: boolean) => {
      try {
        flush();
        const body = JSON.stringify({
          dwell_ms: Math.min(MAX_DWELL_MS, Math.round(state.dwellMs)),
          max_scroll_pct: Math.min(100, Math.round(state.maxScrollPct)),
          interactions: Math.min(MAX_INTERACTIONS, state.interactions),
          pageview,
        });
        const sent =
          typeof navigator.sendBeacon === "function" &&
          navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
        if (!sent) {
          void fetch(ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      } catch {
        // 계측 실패는 무시
      }
    };
    sendRef.current = send;

    const onScroll = () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        state.maxScrollPct = Math.max(state.maxScrollPct, scrollPct());
      });
    };
    const onInteraction = () => {
      state.interactions += 1;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        send(false);
        visibleSince = null;
      } else {
        visibleSince = performance.now();
      }
    };
    const onPageHide = () => send(false);

    state.maxScrollPct = Math.max(state.maxScrollPct, scrollPct());
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", onInteraction, { capture: true, passive: true });
    document.addEventListener("keydown", onInteraction, { capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      flush();
      sendRef.current = null;
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onInteraction, { capture: true });
      document.removeEventListener("keydown", onInteraction, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  // 라우트 변경마다 pageview 1회 (개발 모드 StrictMode의 이중 실행은 같은 경로면 건너뜀)
  useEffect(() => {
    if (!sendRef.current || lastPageviewPath.current === pathname) return;
    lastPageviewPath.current = pathname;
    sendRef.current(true);
  }, [pathname]);

  return null;
}
