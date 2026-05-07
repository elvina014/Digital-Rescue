"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트
 * 'use client' 컴포넌트에서만 사용할 것
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // document.cookie 파싱
          return document.cookie
            .split("; ")
            .filter(Boolean)
            .map((c) => {
              const idx = c.indexOf("=");
              return {
                name: c.slice(0, idx),
                value: decodeURIComponent(c.slice(idx + 1)),
              };
            });
        },
        setAll(cookiesToSet) {
          const siteDomain = process.env.NEXT_PUBLIC_SITE_DOMAIN;
          cookiesToSet.forEach(({ name, value, options }) => {
            // maxAge/expires 제거 → 브라우저 종료 시 만료되는 세션 쿠키로 설정
            const { maxAge: _m, expires: _e, ...rest } = options ?? {};
            let str = `${name}=${encodeURIComponent(value)}`;
            str += `; path=${rest.path ?? "/"}`;
            if (rest.sameSite) str += `; SameSite=${rest.sameSite}`;
            if (rest.secure) str += "; Secure";
            // 서브도메인 간 세션 공유: .digital-rescue.com 으로 쿠키 범위 확장
            if (siteDomain) str += `; Domain=.${siteDomain}`;
            document.cookie = str;
            // 동일 이름의 host-only 잔류 쿠키 제거: 이전에 domain 없이 설정된 쿠키가
            // 남아 있으면 두 쿠키가 동시에 전송돼 토큰 충돌이 발생한다.
            if (siteDomain) {
              document.cookie = `${name}=; path=${rest.path ?? "/"}; Max-Age=0`;
            }
          });
        },
      },
    }
  );
}
