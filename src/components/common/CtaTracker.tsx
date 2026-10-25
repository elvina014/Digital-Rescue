"use client";

import { useEffect } from "react";
import { classifyHref, rememberLanding, trackCta } from "@/lib/ctaTracking";

/**
 * 대고객 페이지 전체의 CTA 클릭을 한 곳에서 계측한다.
 *
 * CTA 링크는 CMS(page_contents) 데이터로 그려지므로 버튼마다 onClick 을 다는 대신
 * document 에 클릭 리스너 1개를 두고 href 로 종류(전화/카톡/접수)를 판별한다.
 * 위치는 가장 가까운 [data-cta-area] → section[id] → header/footer 순으로 정한다.
 */
export function CtaTracker() {
  useEffect(() => {
    rememberLanding();

    function onClick(e: MouseEvent) {
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      const eventType = classifyHref(anchor.getAttribute("href") ?? "");
      if (!eventType) return;

      const area = anchor.closest("[data-cta-area]")?.getAttribute("data-cta-area");
      const section = anchor.closest("section[id]")?.id;
      const landmark = anchor.closest("header")
        ? "header"
        : anchor.closest("footer")
          ? "footer"
          : null;
      trackCta(eventType, area ?? section ?? landmark ?? "unknown");
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
