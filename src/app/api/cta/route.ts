import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/utils/supabase/admin";
import { CTA_EVENT_TYPES } from "@/lib/ctaTracking";

/**
 * CTA 클릭 수집 엔드포인트 (랜딩 개편 Phase 0)
 *
 *   POST /api/cta  ← src/lib/ctaTracking.ts 의 trackCta() 가 sendBeacon 으로 호출
 *
 * - 같은 사이트에서 보낸 요청만 받는다 (Origin 호스트 = 요청 호스트).
 * - 형식이 틀린 요청은 400, 저장 실패는 로그만 남기고 204 (방문자 화면에는 영향 없음).
 * - cta_click_events 는 anon INSERT 가 막혀 있어 service_role 로 저장한다.
 */
const payloadSchema = z.object({
  eventType: z.enum(CTA_EVENT_TYPES),
  location: z.string().min(1).max(40),
  pagePath: z.string().min(1).max(200),
  brandSlug: z.string().max(40).nullable(),
  device: z.enum(["mobile", "desktop"]),
  sessionId: z.string().max(64).nullable(),
  adSource: z.string().max(100).nullable(),
  adKeyword: z.string().max(100).nullable(),
  referrerHost: z.string().max(200).nullable(),
});

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      // 잘못된 Origin — 아래에서 거부
    }
    if (originHost !== request.headers.get("host")) {
      return new NextResponse(null, { status: 403 });
    }
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return new NextResponse(null, { status: 400 });
  }
  const p = parsed.data;

  const { error } = await createAdminClient().from("cta_click_events").insert({
    event_type: p.eventType,
    location: p.location,
    page_path: p.pagePath,
    brand_slug: p.brandSlug,
    device: p.device,
    session_id: p.sessionId,
    ad_source: p.adSource,
    ad_keyword: p.adKeyword,
    referrer_host: p.referrerHost,
  });
  if (error) {
    console.error("[api/cta] insert failed:", error.message);
  }

  return new NextResponse(null, { status: 204 });
}
