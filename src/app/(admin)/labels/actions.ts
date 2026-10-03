"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { toUuidOrNull } from "@/lib/catalogErrors";
import { LOCATION_CODE_RE } from "./shared";

/**
 * 라벨 · 보관 위치 Server Actions — 세션 클라이언트만 사용.
 * 권한은 RLS(storage_locations: ADMIN)와 SECURITY DEFINER RPC(set_storage_location: ADMIN/MANAGER)가 판정한다.
 */

type Result = { error?: string; success?: boolean };

async function session() {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." } as const;
  return { supabase: await createClient() } as const;
}

function locationError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "이미 등록된 위치 코드입니다.";
  if (error.code === "23514") return "입력값이 올바르지 않습니다. (코드 20자, 설명 100자 이내)";
  if (error.code === "42501") return "권한이 없습니다.";
  return "처리에 실패했습니다: " + (error.message ?? "");
}

// ----- 보관 위치 변경 (재고 행 / Donor 기기) -----
export async function setStorageLocationAction(
  kind: "ITEM" | "DONOR",
  id: string,
  locationId: string | null
): Promise<Result & { location?: string | null }> {
  const s = await session();
  if ("error" in s) return s;
  if (!toUuidOrNull(id)) return { error: "대상을 찾을 수 없습니다." };
  if (locationId !== null && !toUuidOrNull(locationId)) return { error: "보관 위치를 찾을 수 없습니다." };

  const { data, error } = await s.supabase.rpc("set_storage_location", {
    p_kind: kind,
    p_id: id,
    p_location_id: locationId as string,
  });
  if (error) return { error: "처리에 실패했습니다: " + error.message };
  const res = data as { error?: string; location?: string | null } | null;
  if (res?.error) return { error: res.error };

  revalidatePath("/scan", "layout");
  revalidatePath(kind === "ITEM" ? "/inventory" : `/donors/${id}`);
  return { success: true, location: res?.location ?? null };
}

// ----- 보관 위치 관리 (ADMIN) -----
export async function createLocationAction(code: string, description: string): Promise<Result & { id?: string }> {
  const s = await session();
  if ("error" in s) return s;
  const c = code.trim().toUpperCase();
  if (!c) return { error: "위치 코드를 입력해 주세요." };
  if (!LOCATION_CODE_RE.test(c)) return { error: "위치 코드는 영문 대문자·숫자와 '-'만 사용할 수 있습니다." };
  if (c.length > 20) return { error: "위치 코드는 20자 이내로 입력해 주세요." };
  if (description.trim().length > 100) return { error: "설명은 100자 이내로 입력해 주세요." };

  const { data, error } = await s.supabase
    .from("storage_locations")
    .insert({ code: c, description: description.trim() || null })
    .select("id")
    .single();
  if (error) return { error: locationError(error) };
  revalidatePath("/inventory/locations");
  return { success: true, id: data.id };
}

export async function updateLocationAction(
  id: string,
  patch: { description?: string; is_active?: boolean }
): Promise<Result> {
  const s = await session();
  if ("error" in s) return s;
  if (!toUuidOrNull(id)) return { error: "보관 위치를 찾을 수 없습니다." };
  const update: { description?: string | null; is_active?: boolean } = {};
  if (patch.description !== undefined) {
    if (patch.description.trim().length > 100) return { error: "설명은 100자 이내로 입력해 주세요." };
    update.description = patch.description.trim() || null;
  }
  if (patch.is_active !== undefined) update.is_active = patch.is_active;

  const { data, error } = await s.supabase.from("storage_locations").update(update).eq("id", id).select("id");
  if (error) return { error: locationError(error) };
  // RLS로 막힌 UPDATE는 오류 없이 0건
  if (!data || data.length === 0) return { error: "권한이 없습니다." };
  revalidatePath("/inventory/locations");
  return { success: true };
}
