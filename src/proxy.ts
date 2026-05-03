import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";
import { canonicalBrandSlug } from "@/lib/brands";

/**
 * Proxy (Route Guard) — Next.js 16
 *
 * 서브도메인 기반 라우팅:
 * - login.digital-rescue.com (login.localhost) → 관리자 포털 /(admin)
 * - edit.digital-rescue.com (edit.localhost)   → CMS 에디터 /(cms)/editor
 * - digital-rescue.com (localhost)             → 대고객 홈페이지 /(main)
 *
 * 1) edit. 서브도메인 미인증 → login.digital-rescue.com/login 으로 리다이렉트
 * 2) login. 서브도메인의 /editor* → edit.digital-rescue.com/editor* 로 강제 리다이렉트
 *    (에디터는 edit. 도메인 전용 — 단일 진입점 강제)
 * 3) admin 서브도메인 + "/" → 인증 여부에 따라 /dashboard 또는 /login 리다이렉트
 * 4) 메인 도메인에서 관리자 경로 접근 → "/" 로 차단
 * 5) admin 서브도메인 보호 경로 미인증 → /login 리다이렉트
 * 6) admin 서브도메인 로그인 페이지 인증 완료 → /dashboard 리다이렉트
 */

// admin 서브도메인에서만 접근 가능한 경로
const ADMIN_PATHS = ["/dashboard", "/editor", "/tickets", "/inventory", "/employees", "/stats", "/login"];
const LOGIN_PATH = "/login";

/** hostname이 admin 서브도메인인지 판별 */
function isAdminHost(request: NextRequest): boolean {
  const host = request.headers.get("host") ?? "";
  return host.startsWith("login.");
}

/** hostname이 edit 서브도메인인지 판별 */
function isEditHost(request: NextRequest): boolean {
  const host = request.headers.get("host") ?? "";
  return host.startsWith("edit.");
}

/** edit 서브도메인에서 login 서브도메인의 로그인 페이지 URL 생성 */
function buildLoginUrlFromEdit(request: NextRequest, params?: Record<string, string>): URL {
  const url = request.nextUrl.clone();
  const host = request.headers.get("host") ?? "";
  url.host = host.replace(/^edit\./, "login.");
  url.pathname = LOGIN_PATH;
  url.search = "";
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return url;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { user, supabaseResponse } = await updateSession(request);

  const onAdmin = isAdminHost(request);
  const onEdit = isEditHost(request);

  // ── edit 서브도메인: 인증 가드 + 루트 리라이트 ──
  // 미인증 → login. 도메인 로그인으로
  // 인증됨 + "/"  → /editor 로 내부 rewrite (브라우저 URL 은 edit. 도메인 그대로 유지)
  // 인증됨 + 그외 → 통과 (예: /editor?page=...&section=... 직접 접근)
  // role 검증은 (cms)/layout.tsx 의 requireCmsAccess() 가 담당.
  if (onEdit) {
    if (!user) {
      return NextResponse.redirect(
        buildLoginUrlFromEdit(request, { redirect: request.url })
      );
    }

    if (pathname === "/") {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = "/editor";
      const response = NextResponse.rewrite(rewriteUrl);
      // updateSession 이 supabaseResponse 에 설정한 갱신 쿠키(.digital-rescue.com 도메인 포함)
      // 를 rewrite 응답으로 그대로 전달 (Set-Cookie 전체 보존)
      const setCookies = supabaseResponse.headers.getSetCookie();
      setCookies.forEach((cookie) =>
        response.headers.append("set-cookie", cookie)
      );
      return response;
    }

    return supabaseResponse;
  }

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

    // 브랜드 슬러그 대소문자 정규화: /Lenovo, /SAMSUNG → /lenovo, /samsung (308)
    // [brand]/page.tsx 는 dynamicParams=false 로 소문자 슬러그만 정적 생성하므로,
    // 다른 케이스로 들어온 요청을 정규 형태로 redirect 해 준다.
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 1) {
      const canonical = canonicalBrandSlug(segments[0]);
      if (canonical && canonical !== segments[0]) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = `/${canonical}`;
        return NextResponse.redirect(redirectUrl, 308);
      }
    }

    // 메인 도메인 일반 요청 → 통과
    return supabaseResponse;
  }

  // ── 이하 admin 서브도메인 로직 ──

  // /editor* 는 edit.digital-rescue.com 전용 → 강제 리다이렉트
  // (인증 체크보다 먼저: 로그인 흐름은 edit. 측 가드가 처리)
  if (pathname === "/editor" || pathname.startsWith("/editor/")) {
    const editUrl = request.nextUrl.clone();
    const host = request.headers.get("host") ?? "";
    editUrl.host = host.replace(/^login\./, "edit.");
    return NextResponse.redirect(editUrl);
  }

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
