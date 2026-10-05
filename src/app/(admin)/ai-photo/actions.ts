"use server";

import sharp from "sharp";
import { z } from "zod";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { catalogErrorMessage, toUuidOrNull } from "@/lib/catalogErrors";
import { AI_PHOTO_ROLES } from "./labels";
import type { PhotoKind, RecognitionResult } from "./labels";

/**
 * AI 사진 인식 (Phase 9) Server Action.
 * 사진 → n8n 사진 인식 워크플로(Header Auth) → OpenRouter → 읽은 텍스트만 돌아온다.
 * 결과는 ai_photo_propose RPC로 ai_candidates(검토 대기)에만 기록된다. n8n은 DB에 접속하지 않는다.
 * 사진은 비공개 버킷 ai-photos 에 `<요청 ID>.webp` 로 저장 (EXIF 제거), 새 후보가 없으면 바로 지운다.
 */

const BUCKET = "ai-photos";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const TIMEOUT_MS = 55_000;
const TARGET_MESSAGE: Record<PhotoKind, string> = {
  PART: "부품 규격을 선택해 주세요.",
  BOARD: "메인보드를 선택해 주세요.",
  DEVICE: "모델을 선택해 주세요.",
};

const responseSchema = z.object({
  readings: z
    .array(
      z.object({
        text: z.string(),
        type: z.enum(["PART_NUMBER", "MARKING", "BOARD_NUMBER", "MODEL_NUMBER", "OTHER"]),
        confidence: z.number().min(0).max(1),
        note: z.string().nullish(),
      })
    )
    .max(10),
  model: z.string().nullish(),
  execution_id: z.union([z.string(), z.number()]).nullish(),
});

type ProposeResult = {
  request_id: string | null;
  created: { candidate_id: string; alias: string; duplicate: boolean }[];
  skipped: { text: string; reason: string; detail: string | null }[];
};

export async function recognizePhotoAction(formData: FormData): Promise<{ error?: string; result?: RecognitionResult }> {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "로그인이 필요합니다. 다시 로그인해 주세요." };
  if (!AI_PHOTO_ROLES.includes(employee.role)) return { error: "AI 사진 인식 권한이 없습니다." };

  const kind = formData.get("kind") as PhotoKind;
  if (!["PART", "BOARD", "DEVICE"].includes(kind)) return { error: "사진 종류를 선택해 주세요." };
  const targetId = toUuidOrNull(formData.get("targetId"));
  if (!targetId) return { error: TARGET_MESSAGE[kind] };
  const variantId = kind === "DEVICE" ? toUuidOrNull(formData.get("variantId")) : null;
  const targetLabel = String(formData.get("targetLabel") ?? "").slice(0, 150);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "사진을 선택해 주세요." };
  if (!ALLOWED_TYPES.includes(file.type)) return { error: `지원하지 않는 파일 형식입니다: ${file.name}` };
  if (file.size > MAX_IMAGE_SIZE) return { error: `파일 크기가 너무 큽니다 (최대 10MB): ${file.name}` };

  const webhookUrl = process.env.N8N_RI_PHOTO_WEBHOOK_URL;
  const secret = process.env.N8N_RI_PHOTO_SECRET;
  if (!webhookUrl || !secret) return { error: "AI 사진 인식이 설정되지 않았습니다." };

  // 회전 보정, 긴 변 2048px, WebP — sharp는 메타데이터(EXIF·GPS)를 기본으로 제거한다
  let image: Buffer;
  try {
    image = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "none" })
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    return { error: "이미지 처리 중 오류가 발생했습니다." };
  }

  const requestId = crypto.randomUUID();
  let response: Response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-RI-Secret": secret },
      body: JSON.stringify({
        request_id: requestId,
        photo_kind: kind,
        target_label: targetLabel,
        image: `data:image/webp;base64,${image.toString("base64")}`,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") return { error: "AI 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요." };
    return { error: "AI 사진 인식 서버에 연결할 수 없습니다." };
  }
  if (response.status === 401 || response.status === 403) {
    return { error: "AI 사진 인식 인증에 실패했습니다. 관리자에게 문의해 주세요." };
  }
  if (!response.ok) return { error: `AI 사진 인식에 실패했습니다 (${response.status}).` };

  let parsed: z.infer<typeof responseSchema>;
  try {
    parsed = responseSchema.parse(await response.json());
  } catch {
    return { error: "AI 응답을 해석할 수 없습니다." };
  }
  if (parsed.readings.length === 0) {
    return { error: "사진에서 읽을 수 있는 번호가 없습니다. 더 가까이, 선명하게 다시 촬영해 주세요." };
  }

  const supabase = await createClient();
  const path = `${requestId}.webp`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, image, { contentType: "image/webp", upsert: false });
  if (uploadError) return { error: "사진 저장에 실패했습니다: " + uploadError.message };

  const { data, error } = await supabase.rpc("ai_photo_propose", {
    p_request_id: requestId,
    p_photo_kind: kind,
    p_target_id: targetId,
    p_variant_id: variantId ?? undefined,
    p_readings: parsed.readings,
    p_ai_model: parsed.model?.slice(0, 100) ?? undefined,
    p_source_ref: parsed.execution_id != null ? String(parsed.execution_id).slice(0, 200) : undefined,
  });
  const res = data as ProposeResult | null;
  // 새 후보가 없으면(오류·중복·이미 등록) 사진을 남기지 않는다
  if (error || !res?.request_id) await supabase.storage.from(BUCKET).remove([path]);
  if (error) return { error: catalogErrorMessage(error) };

  return {
    result: {
      requestId: res?.request_id ?? null,
      created: (res?.created ?? []).map((c) => ({ candidateId: c.candidate_id, alias: c.alias, duplicate: c.duplicate })),
      skipped: res?.skipped ?? [],
    },
  };
}
