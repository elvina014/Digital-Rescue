import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * 미들웨어에서 세션을 갱신하고, 인증 상태를 확인하는 Supabase 클라이언트
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
            // maxAge/expires 제거 → 브라우저 종료 시 만료되는 세션 쿠키로 설정
            const { maxAge: _maxAge, expires: _expires, ...sessionOptions } = options ?? {};
            supabaseResponse.cookies.set(name, value, sessionOptions);
          });
        },
      },
    }
  );

  // 세션 갱신 (PKCE 토큰 리프레시)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, supabaseResponse };
}
