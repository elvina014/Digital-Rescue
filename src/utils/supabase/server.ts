import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * login. / edit. 서브도메인 간 세션 공유를 위해 쿠키 domain 을 상위 도메인으로 설정.
 * middleware.ts 와 동일한 로직 — Server Action(loginAction 등)에서 세션 쿠키를 쓸 때도
 * 반드시 .digital-rescue.com 도메인이 붙어야 edit. 서브도메인에서 세션을 읽을 수 있다.
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
 * 서버 컴포넌트 / Server Actions / Route Handlers 용 Supabase 클라이언트
 * 매 요청마다 새 인스턴스를 생성해야 합니다.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const cookieDomain = getCookieDomain();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...toSessionCookieOptions(value, options),
                // 서브도메인 간 세션 공유: .digital-rescue.com 으로 쿠키 범위 확장
                ...(cookieDomain ? { domain: cookieDomain } : {}),
              })
            );
          } catch {
            // Server Component에서 호출될 경우 쿠키 설정이 불가하므로 무시
            // Middleware에서 세션 갱신이 처리됨
          }
        },
      },
    }
  );
}
