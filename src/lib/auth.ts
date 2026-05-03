import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { EmployeeRole } from "@/types";

export interface CurrentEmployee {
  id: string;
  name: string;
  role: EmployeeRole;
}

export interface CurrentEmployeeFull extends CurrentEmployee {
  email: string;
  phone: string | null;
}

/**
 * 현재 로그인한 직원의 정보를 조회
 * 서버 컴포넌트에서 사용. 미인증 시 null 반환.
 */
export async function getCurrentEmployee(): Promise<CurrentEmployee | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("employees")
    .select("id, name, role")
    .eq("id", user.id)
    .single();

  if (!data) return null;

  return data as CurrentEmployee;
}

/**
 * 현재 로그인한 직원의 전체 프로필(이메일, 연락처 포함) 조회
 * 마이페이지 등 본인 정보 표시에 사용.
 */
export async function getCurrentEmployeeFull(): Promise<CurrentEmployeeFull | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("employees")
    .select("id, name, role, phone")
    .eq("id", user.id)
    .single();

  if (!data) return null;

  return {
    ...(data as { id: string; name: string; role: EmployeeRole; phone: string | null }),
    email: user.email ?? "",
  };
}

/**
 * CMS(/editor) 접근 가드 — 서버 컴포넌트 / Server Action 에서 사용.
 *
 * - 미로그인:        /login 으로 리다이렉트 (편집 페이지로 돌아올 redirect 쿼리 포함)
 * - 권한 부족(직급): /login?error=insufficient_role 로 리다이렉트
 * - ADMIN 또는 MANAGER 만 통과
 *
 * 통과 시 현재 직원 정보를 반환한다. redirect() 가 throw 하므로
 * 함수가 정상적으로 반환했다면 이미 권한 검증이 끝난 상태가 보장된다.
 */
export async function requireCmsAccess(
  redirectAfterLogin: string = "/editor"
): Promise<CurrentEmployee> {
  const employee = await getCurrentEmployee();

  if (!employee) {
    redirect(`/login?redirect=${encodeURIComponent(redirectAfterLogin)}`);
  }

  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    redirect("/login?error=insufficient_role");
  }

  return employee;
}
