"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { catalogErrorMessage, toUuidOrNull } from "@/lib/catalogErrors";
import type { Database } from "@/types/supabase";

/**
 * 부품 규격·호환성 (Phase 3) Server Actions — 항상 세션 클라이언트(createClient)만 사용한다.
 * 호환 상태·신뢰도는 직접 수정할 수 없고, 근거 등록/철회 RPC가 다시 계산한다.
 */

export type PartSpecHit = Database["public"]["Functions"]["part_spec_search"]["Returns"][number];
type Result = { error?: string; success?: boolean };

const PARTS = "/catalog/parts";
const STOCK = "/catalog/parts/stock";
const DENIED: Result = { error: "관리자만 사용할 수 있습니다." };
const text = (v: string | null | undefined) => (v ?? "").trim() || null;

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

// ----- 부품 규격 검색 (전 직원) -----
export async function searchPartSpecsAction(query: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요.", data: [] as PartSpecHit[] };
  if (!query.trim()) return { data: [] as PartSpecHit[] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("part_spec_search", { p_query: query, p_limit: 15 });
  if (error) return { error: catalogErrorMessage(error), data: [] as PartSpecHit[] };
  return { data: (data ?? []) as PartSpecHit[] };
}

// ----- 인라인 새 부품 규격 등록 (CS 제외 — DB 함수에서 권한 확인) -----
export async function createPartSpecAction(input: { partType: string; name: string; manufacturer: string }) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  if (!input.partType) return { error: "부품 종류를 선택해 주세요." };
  if (!input.name.trim()) return { error: "품번(명칭)을 입력해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("part_spec_create", {
    p_part_type: input.partType,
    p_name: input.name,
    p_manufacturer: input.manufacturer.trim() || undefined,
  });
  if (error) return { error: catalogErrorMessage(error) };

  const result = data as { part_spec_id: string; existed: boolean };
  revalidatePath(PARTS);
  return {
    partSpecId: result.part_spec_id,
    existed: result.existed,
    needsReview: !result.existed && employee.role !== EmployeeRole.ADMIN,
  };
}

// ----- 부품 규격 관리 (ADMIN) -----
export async function updatePartSpecAction(
  id: string,
  input: { name: string; manufacturer: string; compatTarget: string; interchangeGroupId: string | null; description: string; needsReview: boolean }
): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  if (!toUuidOrNull(id)) return { error: "부품 규격을 찾을 수 없습니다." };
  if (!input.name.trim()) return { error: "품번(명칭)을 입력해 주세요." };
  const { error } = await supabase
    .from("part_specs")
    .update({
      name: input.name.trim(),
      manufacturer: text(input.manufacturer),
      compat_target: input.compatTarget,
      interchange_group_id: toUuidOrNull(input.interchangeGroupId),
      description: text(input.description),
      needs_review: input.needsReview,
    })
    .eq("id", id);
  return done(error, PARTS);
}

export async function deletePartSpecAction(id: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  const { error } = await supabase.from("part_specs").delete().eq("id", id);
  return done(error, PARTS);
}

export async function addPartAliasAction(partSpecId: string, alias: string, aliasType: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  if (!alias.trim()) return { error: "별칭을 입력해 주세요." };
  const { error } = await supabase
    .from("part_number_aliases")
    .insert({ part_spec_id: partSpecId, alias: alias.trim(), alias_type: aliasType });
  return done(error, PARTS);
}

export async function deletePartAliasAction(id: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  const { error } = await supabase.from("part_number_aliases").delete().eq("id", id);
  return done(error, PARTS);
}

export async function createInterchangeGroupAction(name: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  if (!name.trim()) return { error: "호환 그룹 이름을 입력해 주세요." };
  const { error } = await supabase.from("interchange_groups").insert({ name: name.trim() });
  return done(error, PARTS);
}

// ----- 호환성 근거 (ADMIN) -----
export async function recordCompatibilityAction(input: {
  partSpecId: string;
  targetType: "MODEL" | "VARIANT" | "BOARD";
  targetId: string;
  kind: string;
  observedStatus: string;
  limitationNote: string;
  reference: string;
  note: string;
}): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  const partSpecId = toUuidOrNull(input.partSpecId);
  const targetId = toUuidOrNull(input.targetId);
  if (!partSpecId) return { error: "부품 규격을 찾을 수 없습니다." };
  if (!targetId) return { error: "호환 대상(모델/변형/보드)을 선택해 주세요." };
  const { error } = await supabase.rpc("record_compatibility_result", {
    p_part_spec_id: partSpecId,
    p_target_type: input.targetType,
    p_target_id: targetId,
    p_kind: input.kind,
    p_observed_status: input.observedStatus,
    p_limitation_note: text(input.limitationNote) ?? undefined,
    p_reference: text(input.reference) ?? undefined,
    p_note: text(input.note) ?? undefined,
  });
  return done(error, PARTS);
}

export async function retractEvidenceAction(evidenceId: string, reason: string): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  if (!toUuidOrNull(evidenceId)) return { error: "근거를 찾을 수 없습니다." };
  if (!reason.trim()) return { error: "철회 사유를 입력해 주세요." };
  const { error } = await supabase.rpc("retract_compatibility_evidence", { p_evidence_id: evidenceId, p_reason: reason });
  return done(error, PARTS);
}

// ----- 재고 ↔ 부품 규격 연결 (ADMIN) — part_spec_id만 변경, 수량·금액은 건드리지 않는다 -----
export async function linkItemPartSpecAction(itemId: string, partSpecId: string | null): Promise<Result> {
  const supabase = await adminClient();
  if (!supabase) return DENIED;
  if (!toUuidOrNull(itemId)) return { error: "재고 항목을 찾을 수 없습니다." };
  const { data, error } = await supabase
    .from("inventory_items")
    .update({ part_spec_id: toUuidOrNull(partSpecId) })
    .eq("id", itemId)
    .select("id");
  if (!error && (data?.length ?? 0) === 0) return { error: "재고 항목을 찾을 수 없습니다." };
  return done(error, STOCK);
}
