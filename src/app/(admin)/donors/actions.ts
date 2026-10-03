"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { catalogErrorMessage, toUuidOrNull } from "@/lib/catalogErrors";
import type { InboundInput } from "./labels";

/**
 * Donor 기기 Server Actions — 항상 세션 클라이언트(createClient)만 사용한다.
 * 권한은 RLS와 SECURITY DEFINER RPC(donor_convert_from_ticket, donor_extract_part)가 판정한다.
 */

type Result = { error?: string; success?: boolean };

const BUCKET = "donor-photos";
const MAX_PHOTOS = 12;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const NO_PERMISSION = "권한이 없거나 이미 처리된 항목입니다.";

const text = (v: string | null | undefined) => (v ?? "").trim() || null;

async function session() {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "인증이 필요합니다." } as const;
  return { supabase: await createClient(), employee } as const;
}

function done(donorId: string | null, error: { code?: string; message?: string } | null, affected = 1): Result {
  if (error) return { error: catalogErrorMessage(error) };
  // RLS로 막힌 UPDATE/DELETE는 오류 없이 0건 처리된다
  if (affected === 0) return { error: NO_PERMISSION };
  revalidatePath("/donors");
  if (donorId) revalidatePath(`/donors/${donorId}`);
  return { success: true };
}

function inboundError(i: InboundInput): string | null {
  if (!toUuidOrNull(i.categoryId) || !i.returnSpec.trim() || !i.returnName.trim()) return "카테고리·사양·제품명을 입력해 주세요.";
  if (i.returnSpec.trim() === "외주") return "외주 항목으로는 입고할 수 없습니다.";
  if (i.returnCapacity.trim().length > 50) return "용량은 50자 이내로 입력해 주세요.";
  return null;
}

// ----- 폐기 확인 대기 → Donor 전환 (관리자/팀장) -----
export async function convertToDonorAction(
  ticketId: string,
  input: { consent: boolean; brand: string; modelText: string; tagInfo: string; conditionNote: string; storageNote: string }
): Promise<Result & { donorId?: string; donorNo?: string }> {
  const s = await session();
  if ("error" in s) return s;
  if (!toUuidOrNull(ticketId)) return { error: "접수건을 찾을 수 없습니다." };
  if (!input.consent) return { error: "고객의 소유권 포기(폐기 위임) 동의 확인이 필요합니다." };
  if (!input.brand.trim()) return { error: "브랜드를 입력해 주세요." };

  const { data, error } = await s.supabase.rpc("donor_convert_from_ticket", {
    p_ticket_id: ticketId,
    p_consent: true,
    p_brand: input.brand,
    p_model_text: input.modelText,
    p_tag_info: text(input.tagInfo) ?? undefined,
    p_condition_note: text(input.conditionNote) ?? undefined,
    p_storage_note: text(input.storageNote) ?? undefined,
  });
  if (error) return { error: catalogErrorMessage(error) };
  const res = data as { donor_id: string; donor_no: string };
  revalidatePath("/dashboard");
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/donors");
  return { success: true, donorId: res.donor_id, donorNo: res.donor_no };
}

// ----- Donor 정보 (관리자/팀장) -----
export async function updateDonorAction(
  donorId: string,
  input: {
    brand: string; modelText: string; tagInfo: string; status: string; conditionNote: string; storageNote: string;
    catalogModelId: string | null; catalogVariantId: string | null; catalogBoardId: string | null;
  }
): Promise<Result> {
  const s = await session();
  if ("error" in s) return s;
  if (!toUuidOrNull(donorId)) return { error: "Donor 기기를 찾을 수 없습니다." };
  if (!input.brand.trim()) return { error: "브랜드를 입력해 주세요." };
  const { data, error } = await s.supabase
    .from("donor_devices")
    .update({
      brand: input.brand.trim(),
      model_text: text(input.modelText),
      tag_info: text(input.tagInfo),
      status: input.status,
      condition_note: text(input.conditionNote),
      storage_note: text(input.storageNote),
      catalog_model_id: toUuidOrNull(input.catalogModelId),
      catalog_variant_id: toUuidOrNull(input.catalogVariantId),
      catalog_board_id: toUuidOrNull(input.catalogBoardId),
    })
    .eq("id", donorId)
    .select("id");
  return done(donorId, error, data?.length ?? 0);
}

// ----- 적출 후보 부품 (관리자/팀장/기사/정밀수리팀) -----
export interface CandidateInput {
  description: string;
  partSpecId: string | null;
  quantity: number;
  conditionEstimate: string;
  note: string;
}

export async function addCandidateAction(donorId: string, input: CandidateInput): Promise<Result> {
  const s = await session();
  if ("error" in s) return s;
  if (!input.description.trim()) return { error: "부품 설명을 입력해 주세요." };
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return { error: "수량은 1 이상이어야 합니다." };
  const { error } = await s.supabase.from("donor_part_candidates").insert({
    donor_id: donorId,
    description: input.description.trim(),
    part_spec_id: toUuidOrNull(input.partSpecId),
    quantity: input.quantity,
    condition_estimate: input.conditionEstimate,
    note: text(input.note),
  });
  return done(donorId, error);
}

/** 상태 변경: 적출 가능 ↔ 사용 불가 */
export async function setCandidateStatusAction(donorId: string, candidateId: string, status: "AVAILABLE" | "UNUSABLE"): Promise<Result> {
  const s = await session();
  if ("error" in s) return s;
  const { data, error } = await s.supabase
    .from("donor_part_candidates")
    .update({ status })
    .eq("id", candidateId)
    .in("status", ["AVAILABLE", "REQUESTED", "UNUSABLE"])
    .select("id");
  return done(donorId, error, data?.length ?? 0);
}

export async function deleteCandidateAction(donorId: string, candidateId: string): Promise<Result> {
  const s = await session();
  if ("error" in s) return s;
  const { data, error } = await s.supabase.from("donor_part_candidates").delete().eq("id", candidateId).select("id");
  return done(donorId, error, data?.length ?? 0);
}

/** 기사: 적출 입고 요청 (입고할 분류 입력) — 관리자/팀장이 입고 승인 */
export async function requestExtractionAction(donorId: string, candidateId: string, inbound: InboundInput): Promise<Result> {
  const s = await session();
  if ("error" in s) return s;
  const invalid = inboundError(inbound);
  if (invalid) return { error: invalid };
  const { data, error } = await s.supabase
    .from("donor_part_candidates")
    .update({
      status: "REQUESTED",
      category_id: inbound.categoryId,
      return_spec: inbound.returnSpec.trim(),
      return_name: inbound.returnName.trim(),
      return_capacity: text(inbound.returnCapacity),
    })
    .eq("id", candidateId)
    .in("status", ["AVAILABLE", "REQUESTED"])
    .select("id");
  return done(donorId, error, data?.length ?? 0);
}

/** 관리자/팀장: 적출 입고 (재고 반영). inbound가 없으면 요청 시 입력한 값을 사용 */
export async function extractDonorPartAction(donorId: string | null, candidateId: string, inbound: InboundInput | null): Promise<Result> {
  const s = await session();
  if ("error" in s) return s;
  if (inbound) {
    const invalid = inboundError(inbound);
    if (invalid) return { error: invalid };
  }
  const { data, error } = await s.supabase.rpc("donor_extract_part", {
    p_candidate_id: candidateId,
    ...(inbound && {
      p_category_id: inbound.categoryId ?? undefined,
      p_spec: inbound.returnSpec,
      p_name: inbound.returnName,
      p_capacity: text(inbound.returnCapacity) ?? undefined,
    }),
  });
  if (error) return { error: catalogErrorMessage(error) };
  const res = data as { donor_id: string };
  revalidatePath("/dashboard");
  revalidatePath("/inventory");
  return done(donorId ?? res.donor_id, null);
}

// ----- 사진 (비공개 버킷, 서명 URL) -----
export async function uploadDonorPhotoAction(formData: FormData): Promise<Result> {
  const s = await session();
  if ("error" in s) return s;
  const donorId = toUuidOrNull(formData.get("donorId"));
  const file = formData.get("file");
  if (!donorId) return { error: "Donor 기기를 찾을 수 없습니다." };
  if (!(file instanceof File) || file.size === 0) return { error: "업로드할 파일이 없습니다." };
  if (!file.type.startsWith("image/")) return { error: `지원하지 않는 파일 형식입니다: ${file.name}` };
  if (file.size > MAX_IMAGE_SIZE) return { error: `파일 크기가 너무 큽니다 (최대 10MB): ${file.name}` };

  const { count } = await s.supabase.from("donor_photos").select("id", { count: "exact", head: true }).eq("donor_id", donorId);
  if ((count ?? 0) >= MAX_PHOTOS) return { error: `사진은 최대 ${MAX_PHOTOS}장까지 등록 가능합니다.` };

  let output: Buffer;
  try {
    output = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "none" })
      .rotate()
      .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp()
      .toBuffer();
  } catch {
    return { error: "이미지 처리 중 오류가 발생했습니다." };
  }

  const path = `${donorId}/${Date.now()}.webp`;
  const { error: uploadError } = await s.supabase.storage.from(BUCKET).upload(path, output, { contentType: "image/webp", upsert: false });
  if (uploadError) return { error: "사진 업로드에 실패했습니다: " + uploadError.message };

  const { error } = await s.supabase.from("donor_photos").insert({ donor_id: donorId, path, description: text(formData.get("description") as string) });
  if (error) {
    await s.supabase.storage.from(BUCKET).remove([path]);
    return { error: catalogErrorMessage(error) };
  }
  return done(donorId, null);
}

export async function deleteDonorPhotoAction(donorId: string, photoId: string): Promise<Result> {
  const s = await session();
  if ("error" in s) return s;
  const { data, error } = await s.supabase.from("donor_photos").delete().eq("id", photoId).select("path");
  if (error || !data?.length) return done(donorId, error, 0);
  await s.supabase.storage.from(BUCKET).remove(data.map((p) => p.path));
  return done(donorId, null);
}
