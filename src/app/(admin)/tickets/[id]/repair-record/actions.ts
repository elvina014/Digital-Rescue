"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { toUuidOrNull } from "@/lib/catalogErrors";
import { repairErrorMessage } from "./labels";

/**
 * 수리 기록 Server Actions — 항상 세션 클라이언트(createClient)만 사용한다.
 * 수정 권한과 승인/취소 후 잠금은 RLS(repair_record_can_edit)가 판정한다.
 */

type Result = { error?: string; success?: boolean };
type ListTable = "ticket_symptoms" | "repair_measurements" | "repair_faults" | "repair_actions" | "ticket_removed_parts";

const NO_PERMISSION = "수정 권한이 없습니다. (승인·취소된 접수건의 수리 기록은 관리자만 수정할 수 있습니다)";

async function session(ticketId: string) {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." } as const;
  if (!toUuidOrNull(ticketId)) return { error: "접수건을 찾을 수 없습니다." } as const;
  return { supabase: await createClient() } as const;
}

function done(ticketId: string, error: { code?: string; message?: string } | null, affected = 1): Result {
  if (error) return { error: repairErrorMessage(error) };
  // RLS로 막힌 UPDATE/DELETE는 오류 없이 0건 처리된다
  if (affected === 0) return { error: NO_PERMISSION };
  revalidatePath(`/tickets/${ticketId}`);
  return { success: true };
}

const text = (v: string | null | undefined) => (v ?? "").trim() || null;

// ----- 수리 기록 요약 (접수건당 1개, 없으면 생성) -----
export async function saveRepairRecordAction(
  ticketId: string,
  input: { diagnosisSummary: string; faultCategory: string; result: string; notes: string; removedPartsConfirmed: boolean }
): Promise<Result> {
  const s = await session(ticketId);
  if ("error" in s) return s;
  const { data, error } = await s.supabase
    .from("repair_records")
    .upsert(
      {
        ticket_id: ticketId,
        diagnosis_summary: text(input.diagnosisSummary),
        fault_category: text(input.faultCategory),
        result: text(input.result),
        notes: text(input.notes),
        removed_parts_confirmed: input.removedPartsConfirmed,
      },
      { onConflict: "ticket_id" }
    )
    .select("id");
  return done(ticketId, error, data?.length ?? 0);
}

// ----- 증상 -----
export async function addSymptomAction(ticketId: string, input: { symptomCodeId: string | null; note: string }): Promise<Result> {
  const s = await session(ticketId);
  if ("error" in s) return s;
  const codeId = toUuidOrNull(input.symptomCodeId);
  if (!codeId && !text(input.note)) return { error: "증상 코드를 선택하거나 내용을 입력해 주세요." };
  const { error } = await s.supabase
    .from("ticket_symptoms")
    .insert({ ticket_id: ticketId, symptom_code_id: codeId, note: text(input.note) });
  return done(ticketId, error);
}

// ----- 측정값 -----
export async function addMeasurementAction(
  ticketId: string,
  input: { label: string; kind: string; value: string; unit: string; judgement: string; note: string; sortOrder: number }
): Promise<Result> {
  const s = await session(ticketId);
  if ("error" in s) return s;
  if (!text(input.label)) return { error: "측정 지점을 입력해 주세요." };
  const raw = text(input.value);
  if (!raw) return { error: "측정값을 입력해 주세요." };
  const num = Number(raw);
  const isNum = Number.isFinite(num);
  const { error } = await s.supabase.from("repair_measurements").insert({
    ticket_id: ticketId,
    sort_order: input.sortOrder,
    label: input.label.trim(),
    kind: input.kind,
    value: isNum ? num : null,
    value_text: isNum ? null : raw,
    unit: text(input.unit),
    judgement: input.judgement,
    note: text(input.note),
  });
  return done(ticketId, error);
}

// ----- 고장 부위 -----
export async function addFaultAction(
  ticketId: string,
  input: { component: string; faultType: string; description: string; sortOrder: number }
): Promise<Result> {
  const s = await session(ticketId);
  if ("error" in s) return s;
  if (!text(input.component)) return { error: "부품/위치를 입력해 주세요." };
  const { error } = await s.supabase.from("repair_faults").insert({
    ticket_id: ticketId,
    sort_order: input.sortOrder,
    component: input.component.trim(),
    fault_type: input.faultType,
    description: text(input.description),
  });
  return done(ticketId, error);
}

// ----- 조치 -----
export async function addRepairActionAction(
  ticketId: string,
  input: { actionType: string; description: string; succeeded: boolean | null; sortOrder: number }
): Promise<Result> {
  const s = await session(ticketId);
  if ("error" in s) return s;
  if (!text(input.description)) return { error: "조치 내용을 입력해 주세요." };
  const { error } = await s.supabase.from("repair_actions").insert({
    ticket_id: ticketId,
    sort_order: input.sortOrder,
    action_type: input.actionType,
    description: input.description.trim(),
    succeeded: input.succeeded,
  });
  return done(ticketId, error);
}

export async function setRepairActionResultAction(ticketId: string, id: string, succeeded: boolean | null): Promise<Result> {
  const s = await session(ticketId);
  if ("error" in s) return s;
  const { data, error } = await s.supabase.from("repair_actions").update({ succeeded }).eq("id", id).select("id");
  return done(ticketId, error, data?.length ?? 0);
}

// ----- 적출 부품 (자재 출고 행 없이 떼어낸 부품) -----
export interface RemovedPartInput {
  description: string;
  disposition: string | null;
  categoryId: string | null;
  returnSpec: string;
  returnName: string;
  returnCapacity: string;
  returnCondition: string;
  quantity: number;
  partSpecId: string | null;
}

function removedPartPayload(input: RemovedPartInput): { error: string } | { values: Record<string, unknown> } {
  if (!text(input.description)) return { error: "부품 설명을 입력해 주세요." };
  const stock = input.disposition === "STOCK";
  if (stock) {
    if (!toUuidOrNull(input.categoryId) || !text(input.returnSpec) || !text(input.returnName)) {
      return { error: "재고등록은 카테고리·사양·제품명을 입력해야 합니다." };
    }
    if (input.returnCondition !== "중고품" && input.returnCondition !== "불량품") {
      return { error: "부품 상태(중고품/불량품)를 선택해 주세요." };
    }
    if ((text(input.returnCapacity) ?? "").length > 50) return { error: "용량은 50자 이내로 입력해 주세요." };
  }
  return {
    values: {
      description: input.description.trim(),
      disposition: text(input.disposition),
      category_id: toUuidOrNull(input.categoryId),
      return_spec: stock ? text(input.returnSpec) : null,
      return_name: stock ? text(input.returnName) : null,
      return_capacity: stock ? text(input.returnCapacity) : null,
      return_condition: stock ? input.returnCondition : null,
      quantity: Math.max(1, Math.floor(input.quantity) || 1),
      part_spec_id: toUuidOrNull(input.partSpecId),
    },
  };
}

export async function addRemovedPartAction(ticketId: string, input: RemovedPartInput): Promise<Result> {
  const s = await session(ticketId);
  if ("error" in s) return s;
  const p = removedPartPayload(input);
  if ("error" in p) return p;
  const { error } = await s.supabase
    .from("ticket_removed_parts")
    .insert({ ticket_id: ticketId, description: input.description.trim(), ...p.values });
  return done(ticketId, error);
}

export async function updateRemovedPartAction(ticketId: string, id: string, input: RemovedPartInput): Promise<Result> {
  const s = await session(ticketId);
  if ("error" in s) return s;
  const p = removedPartPayload(input);
  if ("error" in p) return p;
  const { data, error } = await s.supabase.from("ticket_removed_parts").update(p.values).eq("id", id).select("id");
  return done(ticketId, error, data?.length ?? 0);
}

// ----- 사용 부품 호환 확인 (Phase 3 — 단일 트랜잭션 RPC, 판단불가는 근거를 남기지 않는다) -----
export async function recordPartResultAction(
  ticketId: string,
  input: {
    materialId: string;
    partSpecId: string | null;
    answer: "OK" | "CONDITIONAL" | "INCOMPATIBLE" | "UNKNOWN";
    limitationNote: string;
    /** 접수건에 표준 모델/보드가 연결되지 않은 경우에만 사용된다 */
    targetType: "MODEL" | "VARIANT" | "BOARD" | null;
    targetId: string | null;
  }
): Promise<Result> {
  const s = await session(ticketId);
  if ("error" in s) return s;
  if (!toUuidOrNull(input.materialId)) return { error: "자재 내역을 찾을 수 없습니다." };
  if (input.answer !== "UNKNOWN") {
    if (!toUuidOrNull(input.partSpecId)) return { error: "부품 규격을 선택해 주세요." };
    if (input.answer === "CONDITIONAL" && !text(input.limitationNote)) return { error: "조건부는 제한사항을 입력해 주세요." };
  }
  const { error } = await s.supabase.rpc("record_part_install_result", {
    p_material_id: input.materialId,
    p_part_spec_id: toUuidOrNull(input.partSpecId) ?? undefined,
    p_answer: input.answer,
    p_limitation_note: text(input.limitationNote) ?? undefined,
    p_target_type: input.targetType ?? undefined,
    p_target_id: toUuidOrNull(input.targetId) ?? undefined,
  });
  return done(ticketId, error);
}

// ----- 목록 항목 삭제 (공통) -----
export async function removeRepairRowAction(ticketId: string, table: ListTable, id: string): Promise<Result> {
  const s = await session(ticketId);
  if ("error" in s) return s;
  if (!toUuidOrNull(id)) return { error: "항목을 찾을 수 없습니다." };
  const { data, error } = await s.supabase.from(table).delete().eq("id", id).eq("ticket_id", ticketId).select("id");
  return done(ticketId, error, data?.length ?? 0);
}

// ----- 적출 부품 입고 승인 (관리자/팀장 — 단일 트랜잭션 RPC) -----
export async function approveRemovedPartInboundAction(removedPartId: string): Promise<Result> {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  if (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER) {
    return { error: "입고 승인 권한이 없습니다." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_removed_part_inbound", { p_removed_part_id: removedPartId });
  if (error) return { error: repairErrorMessage(error) };
  const res = data as { error?: string; ticket_id?: string } | null;
  if (res?.error) return { error: res.error };

  revalidatePath(`/tickets/${res?.ticket_id}`);
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return { success: true };
}
