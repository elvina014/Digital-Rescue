"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { getNaverApi } from "@/lib/naver-sa/client";
import {
  naverBlockStatusFlow,
  registerNaverBlockFlow,
  unregisterNaverBlockFlow,
  type BlockDb,
  type NaverBlockStatus,
  type NaverSource,
} from "@/lib/naver-sa/core";

/**
 * 네이버 광고노출 제한 IP 등록/해제 (docs/click-guard/NAVER-API.md) Server Actions — ADMIN 전용.
 *
 * 네이버 호출은 서버에서만 한다(lib/naver-sa/client.ts, 'server-only'). 순서와 판단은 lib/naver-sa/core.ts 의 흐름 함수에 있고,
 * 여기서는 권한 확인과 DB 연결만 한다. DB 기록은 로그인한 직원 세션으로 RPC를 호출한다(service role 금지, RPC 안에서 ADMIN 재확인).
 * 외부 시스템 결과가 확정돼야 하므로 화면은 낙관적 UI를 쓰지 않고 이 응답을 받은 뒤 반영한다.
 */

type Result<T = undefined> = { error?: string; message?: string; data?: T };

async function requireAdmin(): Promise<{ error: string } | { name: string }> {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  if (employee.role !== "ADMIN") return { error: "부정클릭 감시는 관리자만 이용할 수 있습니다." };
  return { name: employee.name };
}

async function blockDb(): Promise<BlockDb> {
  const supabase = await createClient();
  const must = (error: { message?: string } | null) => {
    if (error) throw new Error(error.message ?? "db error");
  };
  return {
    async isWhitelisted(ip) {
      const { data, error } = await supabase.rpc("cg_ip_detail", { p_ip: ip, p_days: 1 });
      must(error);
      return (data as { whitelisted?: boolean } | null)?.whitelisted === true;
    },
    async markRegistered(ip, filterId, memo, source) {
      const { error } = await supabase.rpc("cg_mark_naver_registered", {
        p_ip: ip,
        p_filter_id: filterId,
        p_memo: memo,
        p_source: source,
      });
      must(error);
    },
    async markUnregistered(ip) {
      const { error } = await supabase.rpc("cg_mark_naver_unregistered", { p_ip: ip });
      must(error);
    },
    async listErpBlocked() {
      const { data, error } = await supabase.from("cg_ip_marks").select("client_ip, naver_source").eq("status", "naver_blocked");
      must(error);
      return (data ?? []).map((row) => ({ ip: String(row.client_ip), source: (row.naver_source as NaverSource | null) ?? null }));
    },
    async log(entry) {
      const { error } = await supabase.rpc("cg_log_block", {
        p_ip: entry.ip,
        p_action: entry.action,
        p_result: entry.result,
        p_filter_id: entry.filterId ?? null,
        p_detail: entry.detail,
      });
      must(error);
    },
  };
}

export async function registerNaverBlockAction(ip: string, memo: string): Promise<Result<{ source: NaverSource | null }>> {
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };
  if (typeof ip !== "string" || typeof memo !== "string") return { error: "입력값이 올바르지 않습니다." };

  const res = await registerNaverBlockFlow({ ip, memo, adminName: admin.name, now: new Date() }, getNaverApi(), await blockDb());
  revalidatePath("/click-guard");
  if (!res.ok) return { error: res.message };
  return { message: res.message, data: { source: res.source ?? null } };
}

export async function unregisterNaverBlockAction(ip: string): Promise<Result> {
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };
  if (typeof ip !== "string") return { error: "입력값이 올바르지 않습니다." };

  const res = await unregisterNaverBlockFlow({ ip, adminName: admin.name }, getNaverApi(), await blockDb());
  revalidatePath("/click-guard");
  if (!res.ok) return { error: res.message };
  return { message: res.message };
}

/** 네이버 목록을 읽어 사용량과 ERP 표시와의 불일치를 돌려준다. 아무것도 고치지 않는다. quiet=true 면 감사 로그를 남기지 않는다 */
export async function getNaverBlockStatusAction(quiet = false): Promise<Result<NaverBlockStatus>> {
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };

  const res = await naverBlockStatusFlow({ adminName: admin.name, log: quiet !== true }, getNaverApi(), await blockDb());
  if (!res.ok) return { error: res.message };
  return { data: res.status };
}

/** 수동 표시: 사람이 검색광고센터에서 직접 등록한 뒤 누른다. 네이버를 호출하지 않는다 (API 장애 대비) */
export async function markNaverManualAction(ip: string, memo?: string): Promise<Result> {
  const admin = await requireAdmin();
  if ("error" in admin) return { error: admin.error };
  if (typeof ip !== "string" || !ip.trim()) return { error: "IP 형식이 올바르지 않습니다." };
  if (memo && memo.length > 500) return { error: "메모는 500자 이내로 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cg_mark_naver_registered", {
    p_ip: ip.trim(),
    p_filter_id: null,
    p_memo: memo ?? null,
    p_source: "manual",
  });
  if (error) {
    if (error.code === "P0001" && error.message) return { error: error.message };
    if (error.code === "22P02") return { error: "IP 형식이 올바르지 않습니다." };
    return { error: "처리에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
  revalidatePath("/click-guard");
  return {};
}
