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
          cookiesToSet.forEach(({ name, value, options }) => {
            // maxAge/expires 제거 → 브라우저 종료 시 만료되는 세션 쿠키로 설정
            const { maxAge: _m, expires: _e, ...rest } = options ?? {};
            let str = `${name}=${encodeURIComponent(value)}`;
            str += `; path=${rest.path ?? "/"}`;
            if (rest.sameSite) str += `; SameSite=${rest.sameSite}`;
            if (rest.secure) str += "; Secure";
            document.cookie = str;
          });
        },
      },
    }
  );
}
