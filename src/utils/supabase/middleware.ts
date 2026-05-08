import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * login. / edit. 서브도메인 간 세션 공유를 위해 쿠키 domain 을 상위 도메인으로 설정.
 * NEXT_PUBLIC_SITE_DOMAIN=digital-rescue.com 이 설정된 경우 .digital-rescue.com 반환.
 * 미설정(로컬 개발)이면 undefined → 브라우저 기본 동작(현재 도메인만).
 */
function getCookieDomain(): string | undefined {
  const domain = process.env.NEXT_PUBLIC_SITE_DOMAIN;
  return domain ? `.${domain}` : undefined;
}

function toSessionCookieOptions(
  value: string,
  options: Record<string, unknown> | undefined
) {
  const isDeletion = value === "" || options?.maxAge === 0;
  if (isDeletion) return options ?? {};

  const sessionOptions = { ...(options ?? {}) };
  delete sessionOptions.maxAge;
  delete sessionOptions.expires;
  return sessionOptions;
}

/**
 * 미들웨어에서 세션을 갱신하고, 인증 상태를 확인하는 Supabase 클라이언트
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const cookieDomain = getCookieDomain();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, {
              ...toSessionCookieOptions(value, options),
              // 서브도메인 간 세션 공유: .digital-rescue.com 으로 쿠키 범위 확장
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            });
          });
        },
      },
    }
  );

  // 세션 갱신 (PKCE 토큰 리프레시)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    request.cookies.getAll().forEach(({ name, value }) => {
      if (!name.startsWith("sb-")) return;
      supabaseResponse.cookies.set(name, value, {
        path: "/",
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      });
    });
  }

  return { user, supabaseResponse };
}
