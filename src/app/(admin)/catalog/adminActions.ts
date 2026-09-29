"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { catalogErrorMessage, toUuidOrNull } from "@/lib/catalogErrors";
import type { DeviceTypeValue } from "./actions";

/**
 * 기기 마스터 관리 (ADMIN 전용) — 모델/변형/별칭/보드 CRUD
 * 세션 클라이언트 + RLS(ADMIN만 쓰기). 서버에서도 역할을 다시 확인한다.
 */

type Result = { error?: string; success?: boolean };

async function adminClient() {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== EmployeeRole.ADMIN) return null;
  return createClient();
}

function done(error: { code?: string; message?: string } | null, ...paths: string[]): Result {
  if (error) return { error: catalogErrorMessage(error) };
  paths.forEach((p) => revalidatePath(p));
  return { success: true };
}

const DENIED: Result = { error: "관리자만 사용할 수 있습니다." };
const MODELS = "/catalog/models";
const BOARDS = "/catalog/boards";

// ----- 모델 -----
export async function updateCatalogModelAction(
  id: string,
  input: { name: string; deviceType: DeviceTypeValue | null; releaseYear: number | null; notes: string; needsReview: boolean }
): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  if (!toUuidOrNull(id)) return { error: "모델을 찾을 수 없습니다." };
  if (!input.name.trim()) return { error: "모델명을 입력해 주세요." };
  if (input.releaseYear !== null && (input.releaseYear < 1980 || input.releaseYear > 2100)) {
    return { error: "출시 연도는 1980~2100 사이로 입력해 주세요." };
  }
  const { error } = await supabase
    .from("catalog_models")
    .update({
      name: input.name.trim(),
      device_type: input.deviceType,
      release_year: input.releaseYear,
      notes: input.notes.trim() || null,
      needs_review: input.needsReview,
    })
    .eq("id", id);
  return done(error, MODELS);
}

export async function deleteCatalogModelAction(id: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  const { error } = await supabase.from("catalog_models").delete().eq("id", id);
  return done(error, MODELS);
}

// ----- 변형 -----
export async function addCatalogVariantAction(modelId: string, name: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  if (!name.trim()) return { error: "변형 이름을 입력해 주세요." };
  const { error } = await supabase.from("catalog_variants").insert({ model_id: modelId, name: name.trim() });
  return done(error, MODELS);
}

export async function deleteCatalogVariantAction(id: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  const { error } = await supabase.from("catalog_variants").delete().eq("id", id);
  return done(error, MODELS);
}

// ----- 모델 별칭 -----
export async function addCatalogModelAliasAction(modelId: string, alias: string, variantId: string | null): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  if (!alias.trim()) return { error: "별칭을 입력해 주세요." };
  const employee = await getCurrentEmployee();
  const { error } = await supabase.from("catalog_model_aliases").insert({
    model_id: modelId,
    variant_id: toUuidOrNull(variantId),
    alias: alias.trim(),
    source: "manual",
    created_by: employee?.id ?? null,
  });
  return done(error, MODELS);
}

export async function deleteCatalogModelAliasAction(id: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  const { data } = await supabase.from("catalog_model_aliases").select("source").eq("id", id).single();
  if (data?.source === "mapping") {
    return { error: "매핑으로 만든 별칭은 매핑 도구의 '되돌리기'로 해제해 주세요." };
  }
  const { error } = await supabase.from("catalog_model_aliases").delete().eq("id", id);
  return done(error, MODELS);
}

// ----- 모델 ↔ 보드 -----
export async function linkModelBoardAction(modelId: string, boardId: string, variantId: string | null): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  const employee = await getCurrentEmployee();
  const { error } = await supabase.from("catalog_model_boards").insert({
    model_id: modelId,
    board_id: boardId,
    variant_id: toUuidOrNull(variantId),
    created_by: employee?.id ?? null,
  });
  return done(error, MODELS, BOARDS);
}

export async function unlinkModelBoardAction(id: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  const { error } = await supabase.from("catalog_model_boards").delete().eq("id", id);
  return done(error, MODELS, BOARDS);
}

// ----- 보드 -----
export async function createCatalogBoardAction(input: { boardNumber: string; manufacturer: string; notes: string }): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  if (!input.boardNumber.trim()) return { error: "보드 번호를 입력해 주세요." };
  const employee = await getCurrentEmployee();
  const { error } = await supabase.from("catalog_boards").insert({
    board_number: input.boardNumber.trim(),
    manufacturer: input.manufacturer.trim() || null,
    notes: input.notes.trim() || null,
    created_by: employee?.id ?? null,
  });
  return done(error, BOARDS);
}

export async function updateCatalogBoardAction(id: string, input: { manufacturer: string; notes: string }): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  const { error } = await supabase
    .from("catalog_boards")
    .update({ manufacturer: input.manufacturer.trim() || null, notes: input.notes.trim() || null })
    .eq("id", id);
  return done(error, BOARDS);
}

export async function deleteCatalogBoardAction(id: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  const { error } = await supabase.from("catalog_boards").delete().eq("id", id);
  return done(error, BOARDS, MODELS);
}

export async function addBoardAliasAction(boardId: string, alias: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  if (!alias.trim()) return { error: "별칭을 입력해 주세요." };
  const employee = await getCurrentEmployee();
  const { error } = await supabase
    .from("catalog_board_aliases")
    .insert({ board_id: boardId, alias: alias.trim(), created_by: employee?.id ?? null });
  return done(error, BOARDS);
}

export async function deleteBoardAliasAction(id: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  const { error } = await supabase.from("catalog_board_aliases").delete().eq("id", id);
  return done(error, BOARDS);
}
