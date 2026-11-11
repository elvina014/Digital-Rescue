"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { parseIp } from "@/lib/click-guard/ip";
import type { IpDetail, MarkStatus } from "./shared";

/**
 * 부정클릭 감시 (Click Guard MVP 2/2) Server Actions.
 * 모든 변경은 RPC(cg_mark_ip / cg_whitelist_*)로만 하고, 로그인한 직원 세션 클라이언트를 쓴다(service role 금지).
 * RPC 안에서도 ADMIN을 다시 확인한다. 여기서는 한국어 안내를 위해 먼저 확인한다(KI-12).
 */

type Result<T = undefined> = { error?: string; data?: T };

const MARK_STATUSES: MarkStatus[] = ["naver_blocked", "watch", "normal"];

async function requireAdmin(): Promise<string | null> {
  const employee = await getCurrentEmployee();
  if (!employee) return "로그인이 필요합니다. 다시 로그인해 주세요.";
  if (employee.role !== "ADMIN") return "부정클릭 감시는 관리자만 이용할 수 있습니다.";
  return null;
}

function rpcError(error: { code?: string; message?: string }): string {
  // RPC의 RAISE EXCEPTION(P0001)은 이미 한국어 문구
  if (error.code === "P0001" && error.message) return error.message;
  if (error.code === "22P02") return "IP 또는 대역 형식이 올바르지 않습니다.";
  if (error.code === "42501") return "권한이 없습니다.";
  return "처리에 실패했습니다. 잠시 후 다시 시도해 주세요.";
}

/** IP 문자열 검증 → 표준 표기. 형식이 틀리면 null */
function normalizeIp(value: string): string | null {
  const parsed = parseIp(value);
  if (!parsed) return null;
  return value.trim().replace(/^\[|\]$/g, "");
}

export async function markIpAction(ip: string, status: MarkStatus | null, memo?: string): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return { error: denied };
  const normalized = normalizeIp(ip);
  if (!normalized) return { error: "IP 형식이 올바르지 않습니다." };
  if (status !== null && !MARK_STATUSES.includes(status)) return { error: "표시 상태가 올바르지 않습니다." };
  if (memo && memo.length > 500) return { error: "메모는 500자 이내로 입력해 주세요." };

  const supabase = await createClient();
  // ERP가 네이버 API로 등록한 IP는 표시만 바꾸면 네이버 쪽 차단이 남는다 → 먼저 [차단 해제]를 해야 한다
  const { data: current } = await supabase
    .from("cg_ip_marks")
    .select("status, naver_source")
    .eq("client_ip", normalized)
    .maybeSingle();
  if (current?.status === "naver_blocked" && current.naver_source === "api") {
    return { error: "네이버에 API로 등록된 IP입니다. 먼저 [차단 해제]를 해 주세요." };
  }
  const { error } = await supabase.rpc("cg_mark_ip", { p_ip: normalized, p_status: status, p_memo: memo ?? null });
  if (error) return { error: rpcError(error) };
  revalidatePath("/click-guard");
  return {};
}

/** "203.0.113.0/24" 또는 단일 IP("203.0.113.7" → /32, IPv6 → /128) */
function parseCidrInput(value: string): { cidr: string } | { error: string } {
  const text = value.trim();
  if (!text) return { error: "IP 또는 대역을 입력해 주세요." };
  const [addr, bitsText, ...rest] = text.split("/");
  const ip = parseIp(addr);
  if (!ip || rest.length > 0) return { error: "IP 또는 대역 형식이 올바르지 않습니다. 예: 203.0.113.7 또는 203.0.113.0/24" };
  const maxBits = ip.version === 4 ? 32 : 128;
  const bits = bitsText === undefined ? maxBits : Number(bitsText);
  if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) {
    return { error: `대역 길이는 0~${maxBits} 사이여야 합니다.` };
  }
  return { cidr: `${addr.trim()}/${bits}` };
}

export async function addWhitelistAction(value: string, reason?: string): Promise<Result<{ id: number; cidr: string }>> {
  const denied = await requireAdmin();
  if (denied) return { error: denied };
  const parsed = parseCidrInput(value);
  if ("error" in parsed) return { error: parsed.error };
  if (reason && reason.length > 200) return { error: "사유는 200자 이내로 입력해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cg_whitelist_upsert", { p_cidr: parsed.cidr, p_reason: reason ?? null });
  if (error) {
    // 호스트 비트가 남은 대역(예: 203.0.113.7/24)은 cidr 형식 오류
    if (error.code === "22P02") return { error: "대역 주소가 올바르지 않습니다. 예: 203.0.113.0/24 (마지막 자리를 0으로)" };
    return { error: rpcError(error) };
  }
  revalidatePath("/click-guard");
  return { data: { id: Number(data), cidr: parsed.cidr } };
}

export async function deleteWhitelistAction(id: number): Promise<Result> {
  const denied = await requireAdmin();
  if (denied) return { error: denied };
  if (!Number.isInteger(id) || id <= 0) return { error: "삭제할 항목이 올바르지 않습니다." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cg_whitelist_delete", { p_id: id });
  if (error) return { error: rpcError(error) };
  revalidatePath("/click-guard");
  return {};
}

export async function getIpDetailAction(ip: string): Promise<Result<IpDetail>> {
  const denied = await requireAdmin();
  if (denied) return { error: denied };
  const normalized = normalizeIp(ip);
  if (!normalized) return { error: "IP 형식이 올바르지 않습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cg_ip_detail", { p_ip: normalized, p_days: 30 });
  if (error) return { error: rpcError(error) };
  return { data: data as IpDetail };
}
