import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

/**
 * On-Demand 재검증 엔드포인트.
 *
 * 용도: n8n 이 뉴스를 published 로 전환한 직후 호출해 메인 페이지 캐시를 즉시 무효화한다.
 *   GET https://digital-rescue.com/api/revalidate?secret=...&path=/
 *
 * 인증: REVALIDATE_SECRET 환경변수와 일치하는 secret 쿼리/헤더만 허용.
 *   - 시크릿이 설정돼 있지 않으면 항상 거부(빈 시크릿 우회 방지).
 *
 * 동작: 지정 path(기본 "/")를 layout 단위로 재검증.
 *   page_contents 저장 경로(savePageContentAction)와 동일하게 layout 단위로 일괄 무효화한다.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) {
    return NextResponse.json(
      { revalidated: false, message: "REVALIDATE_SECRET 미설정" },
      { status: 500 }
    );
  }

  const provided =
    request.nextUrl.searchParams.get("secret") ??
    request.headers.get("x-revalidate-secret");

  if (provided !== expected) {
    return NextResponse.json(
      { revalidated: false, message: "인증 실패" },
      { status: 401 }
    );
  }

  const path = request.nextUrl.searchParams.get("path") || "/";
  revalidatePath(path, "layout");

  return NextResponse.json({
    revalidated: true,
    path,
    now: Date.now(),
  });
}
