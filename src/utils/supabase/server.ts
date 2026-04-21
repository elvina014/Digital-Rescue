import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 서버 컴포넌트 / Server Actions / Route Handlers 용 Supabase 클라이언트
 * 매 요청마다 새 인스턴스를 생성해야 합니다.
 */
export async function createClient() {
  const cookieStore = await cookies();

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
            cookiesToSet.forEach(({ name, value, options }) => {
              // 브라우저 종료 시 세션 만료: maxAge/expires를 제거해 session cookie로 설정
              const sessionOptions = { ...options };
              delete (sessionOptions as Record<string, unknown>).maxAge;
              delete (sessionOptions as Record<string, unknown>).expires;
              cookieStore.set(name, value, sessionOptions);
            });
          } catch {
            // Server Component에서 호출될 경우 쿠키 설정이 불가하므로 무시
            // Middleware에서 세션 갱신이 처리됨
          }
        },
      },
    }
  );
}
