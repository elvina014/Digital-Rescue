import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Route Protection 미들웨어
 * - /(admin)/* 및 /(cms)/* 경로는 인증 필수
 * - 미인증 사용자는 /login 페이지로 리다이렉트
 * - 이미 로그인된 사용자가 /login 접근 시 /dashboard로 리다이렉트
 */

// 보호 대상 경로 패턴
const PROTECTED_PATHS = ["/dashboard", "/editor", "/tickets", "/inventory", "/employees", "/stats"];
const LOGIN_PATH = "/login";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { user, supabaseResponse } = await updateSession(request);

  const isProtectedPath = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
  const isLoginPath = pathname === LOGIN_PATH;

  // 보호 경로에 미인증 접근 → 로그인으로 리다이렉트
  if (isProtectedPath && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    // 로그인 후 원래 가려던 페이지로 돌아가기 위해 redirect 파라미터 추가
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 이미 로그인된 사용자가 /login 접근 → 대시보드로 리다이렉트
  if (isLoginPath && user) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 요청에 미들웨어 적용:
     * - _next/static (정적 파일)
     * - _next/image (이미지 최적화)
     * - favicon.ico
     * - 정적 에셋 (svg, png, jpg 등)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
