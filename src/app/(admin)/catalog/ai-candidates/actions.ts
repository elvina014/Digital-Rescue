"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { catalogErrorMessage, toUuidOrNull } from "@/lib/catalogErrors";

/**
 * AI 후보(VECTOR) 검토 (Phase 8) Server Actions — 세션 클라이언트만 사용한다.
 * 각 액션이 직접 로그인·관리자 여부를 확인한다 (프록시는 서버 액션을 리다이렉트하지 않음, KI-12).
 * 승인은 문서 근거(documented) / 추정(inferred)만 가능하고, 후보 내용은 수정할 수 없다 (DB 함수에서도 확인).
 */

type Result = { error?: string; success?: boolean };

const PAGE = "/catalog/ai-candidates";
const text = (v: string | null | undefined) => (v ?? "").trim() || null;

async function adminSession() {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." } as const;
  if (employee.role !== EmployeeRole.ADMIN) return { error: "관리자만 사용할 수 있습니다." } as const;
  return { supabase: await createClient() } as const;
}

export async function approveAiCandidateAction(input: {
  candidateId: string;
  approveAs: "DOCUMENT" | "INFERENCE" | null;
  reference: string;
  note: string;
}): Promise<Result> {
  const session = await adminSession();
  if ("error" in session) return { error: session.error };
  const id = toUuidOrNull(input.candidateId);
  if (!id) return { error: "AI 후보를 찾을 수 없습니다." };
  const reference = text(input.reference);
  const note = text(input.note);
  if (input.approveAs === "DOCUMENT" && !reference) return { error: "문서 근거로 승인하려면 출처를 입력해 주세요." };
  if (reference && reference.length > 500) return { error: "출처는 500자 이내로 입력해 주세요." };
  if (note && note.length > 500) return { error: "검토 메모는 500자 이내로 입력해 주세요." };

  const { error } = await session.supabase.rpc("ai_candidate_approve", {
    p_candidate_id: id,
    p_approve_as: input.approveAs ?? undefined,
    p_reference: reference ?? undefined,
    p_note: note ?? undefined,
  });
  if (error) return { error: catalogErrorMessage(error) };
  revalidatePath(PAGE);
  revalidatePath("/catalog/parts");
  return { success: true };
}

export async function rejectAiCandidateAction(candidateId: string, reason: string): Promise<Result> {
  const session = await adminSession();
  if ("error" in session) return { error: session.error };
  const id = toUuidOrNull(candidateId);
  if (!id) return { error: "AI 후보를 찾을 수 없습니다." };
  const r = text(reason);
  if (!r) return { error: "반려 사유를 입력해 주세요." };
  if (r.length > 500) return { error: "반려 사유는 500자 이내로 입력해 주세요." };

  const { error } = await session.supabase.rpc("ai_candidate_reject", { p_candidate_id: id, p_reason: r });
  if (error) return { error: catalogErrorMessage(error) };
  revalidatePath(PAGE);
  return { success: true };
}
