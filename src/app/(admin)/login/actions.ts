"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { headers, cookies } from "next/headers";

const ACTIVITY_COOKIE = "dr_last_activity";

function getCookieDomain(): string | undefined {
  const domain = process.env.NEXT_PUBLIC_SITE_DOMAIN;
  return domain ? `.${domain}` : undefined;
}

/** 현재 요청의 Host 헤더에서 origin을 구성 */
async function getAdminOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function isTrustedRedirectUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "digital-rescue.com" ||
      url.hostname.endsWith(".digital-rescue.com")
    );
  } catch {
    return false;
  }
}

/**
 * 이메일/비밀번호 로그인 Server Action
 */
export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = (formData.get("redirect") as string) || "/dashboard";

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 모두 입력해 주세요." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  // 로그인 성공 직후 활동 시간 쿠키를 현재 시간으로 초기화
  // (오래된 dr_last_activity 잔재가 미들웨어에서 만료로 오판되는 것을 방지)
  const cookieStore = await cookies();
  const cookieDomain = getCookieDomain();
  cookieStore.set(ACTIVITY_COOKIE, String(Date.now()), {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });

  const origin = await getAdminOrigin();
  const destination = isTrustedRedirectUrl(redirectTo)
    ? redirectTo
    : `${origin}${redirectTo.startsWith("/") ? redirectTo : "/dashboard"}`;

  return { redirectTo: destination };
}

/**
 * 로그아웃 Server Action
 */
export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";

  // edit 서브도메인에서 로그아웃 시 login 서브도메인 /login 으로 이동
  const loginHost = host.startsWith("edit.")
    ? host.replace(/^edit\./, "login.")
    : host;

  redirect(`${proto}://${loginHost}/login`);
}
