"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { catalogErrorMessage, toUuidOrNull } from "@/lib/catalogErrors";

/**
 * AI 후보 검토 (Phase 8 VECTOR · Phase 9 사진 인식) Server Actions — 세션 클라이언트만 사용한다.
 * 각 액션이 직접 로그인·관리자 여부를 확인한다 (프록시는 서버 액션을 리다이렉트하지 않음, KI-12).
 * 승인은 문서 근거(documented) / 추정(inferred)만 가능하고, 후보 내용은 수정할 수 없다 (DB 함수에서도 확인).
 */

type Result = { error?: string; success?: boolean };

const PAGE = "/catalog/ai-candidates";
const PHOTO_BUCKET = "ai-photos";
const text = (v: string | null | undefined) => (v ?? "").trim() || null;

async function adminSession() {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." } as const;
  if (employee.role !== EmployeeRole.ADMIN) return { error: "관리자만 사용할 수 있습니다." } as const;
  return { supabase: await createClient() } as const;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** 사진 인식 후보의 사진: 그 사진의 검토 대기 후보가 남아 있지 않으면 비공개 버킷에서 지운다 (D3) */
async function deletePhotoIfReviewed(supabase: Supabase, photoRequestId: string): Promise<{ pending?: boolean; error?: string }> {
  const { data: req } = await supabase.from("ai_photo_requests").select("storage_path").eq("id", photoRequestId).maybeSingle();
  if (!req) return {};
  const { count, error } = await supabase
    .from("ai_candidates")
    .select("id", { count: "exact", head: true })
    .eq("photo_request_id", photoRequestId)
    .eq("status", "PENDING");
  if (error) return { error: "사진 삭제 여부를 확인하지 못했습니다." };
  if ((count ?? 0) > 0) return { pending: true };
  const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove([req.storage_path]);
  return removeError ? { error: "사진 삭제에 실패했습니다. 다시 시도해 주세요." } : {};
}

/** 검토 후: 실패해도 검토 결과는 유지된다. 남은 사진은 검토된 카드의 "사진 삭제"로 다시 지울 수 있다 */
async function cleanupPhoto(supabase: Supabase, photoRequestId: string | null) {
  if (!photoRequestId) return;
  const res = await deletePhotoIfReviewed(supabase, photoRequestId);
  if (res.error) console.error("[ai-candidates] photo cleanup failed:", photoRequestId, res.error);
}

async function photoRequestOf(supabase: Supabase, candidateId: string) {
  const { data } = await supabase.from("ai_candidates").select("photo_request_id").eq("id", candidateId).maybeSingle();
  return data?.photo_request_id ?? null;
}

export async function deleteCandidatePhotoAction(photoRequestId: string): Promise<Result> {
  const session = await adminSession();
  if ("error" in session) return { error: session.error };
  const id = toUuidOrNull(photoRequestId);
  if (!id) return { error: "사진을 찾을 수 없습니다." };
  const res = await deletePhotoIfReviewed(session.supabase, id);
  if (res.pending) return { error: "검토 대기 중인 후보가 남아 있어 사진을 지울 수 없습니다." };
  if (res.error) return { error: res.error };
  revalidatePath(PAGE);
  return { success: true };
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

  const photoRequestId = await photoRequestOf(session.supabase, id);
  const { error } = await session.supabase.rpc("ai_candidate_approve", {
    p_candidate_id: id,
    p_approve_as: input.approveAs ?? undefined,
    p_reference: reference ?? undefined,
    p_note: note ?? undefined,
  });
  if (error) return { error: catalogErrorMessage(error) };
  await cleanupPhoto(session.supabase, photoRequestId);
  revalidatePath(PAGE);
  revalidatePath("/catalog/parts");
  revalidatePath("/catalog/models");
  revalidatePath("/catalog/boards");
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

  const photoRequestId = await photoRequestOf(session.supabase, id);
  const { error } = await session.supabase.rpc("ai_candidate_reject", { p_candidate_id: id, p_reason: r });
  if (error) return { error: catalogErrorMessage(error) };
  await cleanupPhoto(session.supabase, photoRequestId);
  revalidatePath(PAGE);
  return { success: true };
}
