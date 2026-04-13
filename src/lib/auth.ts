import { createClient } from "@/utils/supabase/server";
import type { EmployeeRole } from "@/types";

export interface CurrentEmployee {
  id: string;
  name: string;
  role: EmployeeRole;
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
