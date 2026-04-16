import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Proxy (Route Guard) — Next.js 16
 *
 * 서브도메인 기반 라우팅:
 * - login.digital-rescue.com (login.localhost) → 관리자 포털 /(admin)
 * - digital-rescue.com (localhost)             → 대고객 홈페이지 /(main)
 *
 * 1) admin 서브도메인 + "/" → 인증 여부에 따라 /dashboard 또는 /login 리다이렉트
 * 2) 메인 도메인에서 관리자 경로 접근 → "/" 로 차단
 * 3) admin 서브도메인 보호 경로 미인증 → /login 리다이렉트
 * 4) admin 서브도메인 로그인 페이지 인증 완료 → /dashboard 리다이렉트
 */

// admin 서브도메인에서만 접근 가능한 경로
const ADMIN_PATHS = ["/dashboard", "/editor", "/tickets", "/inventory", "/employees", "/stats", "/login"];
const LOGIN_PATH = "/login";

/** hostname이 admin 서브도메인인지 판별 */
function isAdminHost(hostname: string): boolean {
  return hostname.startsWith("login.");
}

export async function proxy(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;
  const { user, supabaseResponse } = await updateSession(request);

  const onAdmin = isAdminHost(hostname);

  // ── 메인 도메인 가드: 관리자 전용 경로 차단 ──
  if (!onAdmin) {
    const isAdminPath = ADMIN_PATHS.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
    if (isAdminPath) {
      const mainUrl = request.nextUrl.clone();
      mainUrl.pathname = "/";
      return NextResponse.redirect(mainUrl);
    }
    // 메인 도메인 일반 요청 → 통과
    return supabaseResponse;
  }

  // ── 이하 admin 서브도메인 로직 ──

  // 루트("/") 접속 → 인증 여부에 따라 분기
  if (pathname === "/") {
    const dest = request.nextUrl.clone();
    dest.pathname = user ? "/dashboard" : LOGIN_PATH;
    return NextResponse.redirect(dest);
  }

  // 보호 경로 미인증 → /login 리다이렉트
  const isProtected = ADMIN_PATHS.filter((p) => p !== LOGIN_PATH).some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 이미 로그인된 사용자가 /login 접근 → /dashboard
  if (pathname === LOGIN_PATH && user) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 요청에 proxy 적용:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico
     * - 정적 에셋 (svg, png, jpg 등)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
