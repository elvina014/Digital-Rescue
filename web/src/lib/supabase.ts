import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Supabase 클라이언트 (클라이언트 사이드)
 * RLS(Row Level Security)가 적용된 anon key 사용
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
