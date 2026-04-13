import { createClient } from "@supabase/supabase-js";

/**
 * Service Role 키를 사용하는 Supabase Admin 클라이언트.
 * RLS를 우회하므로 Server Actions 등 서버 전용 코드에서만 사용해야 합니다.
 * 절대 클라이언트에 노출하지 마세요.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
