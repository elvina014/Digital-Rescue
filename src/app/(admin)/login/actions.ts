"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { headers } from "next/headers";

/** 현재 요청의 Host 헤더에서 origin을 구성 */
async function getAdminOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
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

  const origin = await getAdminOrigin();
  redirect(`${origin}${redirectTo}`);
}

/**
 * 로그아웃 Server Action
 */
export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const origin = await getAdminOrigin();
  redirect(`${origin}/login`);
}
