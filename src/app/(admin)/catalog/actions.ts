"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { catalogErrorMessage, toUuidOrNull } from "@/lib/catalogErrors";
import type { Database } from "@/types/supabase";

/**
 * 기기 마스터(catalog_*) — 모델 선택기 + 매핑 도구 Server Actions
 * 항상 세션 클라이언트(createClient)만 사용한다. service_role 사용 금지:
 * RLS가 우회되고, 승인건 보호 트리거가 매핑을 막는다.
 */

type Fn = Database["public"]["Functions"];
export type CatalogModelHit = Fn["catalog_search_models"]["Returns"][number];
export type CatalogBoardHit = Fn["catalog_search_boards"]["Returns"][number];
export type UnmappedGroup = Fn["catalog_unmapped_model_strings"]["Returns"][number];
export type DeviceTypeValue = Database["public"]["Enums"]["device_type"];

export interface CatalogVariant {
  id: string;
  name: string;
}

async function requireEmployee() {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." } as const;
  return { employee } as const;
}

async function requireAdmin() {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== EmployeeRole.ADMIN) {
    return { error: "관리자만 사용할 수 있습니다." } as const;
  }
  return { employee } as const;
}

// ----- 모델 검색 (전 직원) -----
export async function searchCatalogModelsAction(query: string) {
  const auth = await requireEmployee();
  if ("error" in auth) return { error: auth.error, data: [] as CatalogModelHit[] };
  if (!query.trim()) return { data: [] as CatalogModelHit[] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalog_search_models", { p_query: query, p_limit: 15 });
  if (error) return { error: catalogErrorMessage(error), data: [] as CatalogModelHit[] };
  return { data: (data ?? []) as CatalogModelHit[] };
}

// ----- 모델의 변형 목록 -----
export async function getCatalogVariantsAction(modelId: string) {
  const auth = await requireEmployee();
  if ("error" in auth) return { error: auth.error, data: [] as CatalogVariant[] };
  const id = toUuidOrNull(modelId);
  if (!id) return { data: [] as CatalogVariant[] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_variants")
    .select("id, name")
    .eq("model_id", id)
    .order("name");
  if (error) return { error: catalogErrorMessage(error), data: [] as CatalogVariant[] };
  return { data: (data ?? []) as CatalogVariant[] };
}

// ----- 보드 검색 (전 직원) -----
export async function searchCatalogBoardsAction(query: string) {
  const auth = await requireEmployee();
  if ("error" in auth) return { error: auth.error, data: [] as CatalogBoardHit[] };
  if (!query.trim()) return { data: [] as CatalogBoardHit[] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalog_search_boards", { p_query: query, p_limit: 15 });
  if (error) return { error: catalogErrorMessage(error), data: [] as CatalogBoardHit[] };
  return { data: (data ?? []) as CatalogBoardHit[] };
}

// ----- 인라인 새 모델 등록 (CS 제외 — DB 함수에서 권한 확인) -----
export async function createCatalogModelAction(input: {
  brand: string;
  model: string;
  deviceType: DeviceTypeValue | null;
  variant: string | null;
}) {
  const auth = await requireEmployee();
  if ("error" in auth) return { error: auth.error };
  if (!input.brand.trim()) return { error: "브랜드를 입력해 주세요." };
  if (!input.model.trim()) return { error: "모델명을 입력해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalog_create_model", {
    p_brand: input.brand,
    p_model: input.model,
    p_device_type: input.deviceType ?? undefined,
    p_variant: input.variant?.trim() || undefined,
  });
  if (error) return { error: catalogErrorMessage(error) };

  const result = data as { model_id: string; variant_id: string | null; existed: boolean };
  revalidatePath("/catalog/models");
  return {
    modelId: result.model_id,
    variantId: result.variant_id,
    existed: result.existed,
    needsReview: !result.existed && auth.employee.role !== EmployeeRole.ADMIN,
  };
}

// ----- 매핑 도구 (ADMIN) -----
export async function getUnmappedModelStringsAction() {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error, data: [] as UnmappedGroup[] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalog_unmapped_model_strings", { p_limit: 300 });
  if (error) return { error: catalogErrorMessage(error), data: [] as UnmappedGroup[] };
  return { data: (data ?? []) as UnmappedGroup[] };
}

export async function mapModelStringAction(input: {
  norm: string;
  modelId: string;
  variantId: string | null;
  alias: string;
}) {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const modelId = toUuidOrNull(input.modelId);
  if (!modelId) return { error: "연결할 모델을 선택해 주세요." };
  if (!input.alias.trim()) return { error: "별칭을 입력해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalog_map_model_string", {
    p_norm: input.norm,
    p_model_id: modelId,
    p_variant_id: toUuidOrNull(input.variantId) ?? undefined,
    p_alias: input.alias,
  });
  if (error) return { error: catalogErrorMessage(error) };

  const result = data as { alias_id: string; linked: number };
  revalidatePath("/tickets");
  return { aliasId: result.alias_id, linked: result.linked };
}

export async function unmapAliasAction(aliasId: string) {
  const auth = await requireAdmin();
  if ("error" in auth) return { error: auth.error };
  const id = toUuidOrNull(aliasId);
  if (!id) return { error: "별칭을 찾을 수 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("catalog_unmap_alias", { p_alias_id: id });
  if (error) return { error: catalogErrorMessage(error) };

  const result = data as { unlinked: number; alias_deleted: boolean };
  revalidatePath("/tickets");
  return { unlinked: result.unlinked };
}
