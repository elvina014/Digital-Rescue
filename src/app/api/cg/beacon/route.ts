import { after, type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CG_COOKIE, isClickGuardEnabled, isValidSessionId, recordEngagement } from "@/lib/click-guard/server";

/**
 * Click Guard 참여도 비콘 (docs/click-guard/SPEC.md "MVP SPEC")
 *
 *   POST /api/cg/beacon  ← src/components/click-guard/ClickGuardTracker.tsx (sendBeacon)
 *
 * - 세션은 cg_sid 쿠키(서버 발급, httpOnly)로만 식별한다. 쿠키가 없으면 아무것도 하지 않는다.
 * - IP 등은 클라이언트에서 받지 않는다.
 * - 본문 2KB 제한, 스키마 검증. 결과와 관계없이 항상 204 (방문자 화면에 영향 없음).
 */
const MAX_BODY_BYTES = 2048;

const beaconSchema = z.object({
  dwell_ms: z.number().int().min(0).max(86_400_000),
  max_scroll_pct: z.number().int().min(0).max(100),
  interactions: z.number().int().min(0).max(100_000),
  pageview: z.boolean(),
});

const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest) {
  try {
    if (!isClickGuardEnabled()) return noContent();
    const sessionId = request.cookies.get(CG_COOKIE)?.value;
    if (!isValidSessionId(sessionId)) return noContent();

    // 같은 사이트에서 보낸 요청만 받는다 (/api/cta 와 동일)
    const origin = request.headers.get("origin");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        return noContent();
      }
      if (originHost !== request.headers.get("host")) return noContent();
    }

    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return noContent();
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return noContent();

    const parsed = beaconSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return noContent();
    const b = parsed.data;

    after(() =>
      recordEngagement(sessionId, {
        dwellMs: b.dwell_ms,
        maxScrollPct: b.max_scroll_pct,
        interactions: b.interactions,
        pageview: b.pageview,
      })
    );
  } catch {
    // 잘못된 JSON 등 — 무시
  }
  return noContent();
}
