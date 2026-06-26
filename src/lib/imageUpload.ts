"use client";

import { uploadTicketImageAction } from "@/app/(admin)/tickets/actions";

const MAX_IMAGES_PER_TICKET = 12;

export interface TicketImage {
  path: string;
  url: string;
  description?: string;
  uploaded_by?: string;
  uploader_name?: string;
  uploaded_at?: string;
  is_customer?: boolean;
}

/**
 * 단일 이미지를 서버로 전송해 WebP로 압축·업로드합니다.
 *
 * 압축은 서버 액션(uploadTicketImageAction)에서 sharp 로 처리한다. 일부 모바일
 * 브라우저(예: 갤럭시 S20)에서 canvas 기반 클라이언트 압축이 실패하던 문제를 피하기 위함이며,
 * 공개 접수 폼(submitTicketAction)과 동일한 서버 사이드 처리 경로를 사용한다.
 *
 * @param ticketId 티켓 ID (스토리지 폴더 경로로 사용)
 * @param file 업로드할 File (1장)
 * @param existingCount 이미 업로드된 이미지 수
 * @param meta 메타데이터 (description, is_customer 등)
 * @returns 업로드 결과 TicketImage 또는 에러
 */
export async function compressAndUploadSingle(
  ticketId: string,
  file: File,
  existingCount: number,
  meta: {
    description?: string;
    uploaded_by?: string;
    uploader_name?: string;
    is_customer?: boolean;
  }
): Promise<{ uploaded: TicketImage | null; error?: string }> {
  if (existingCount >= MAX_IMAGES_PER_TICKET) {
    return { uploaded: null, error: `이미지는 최대 ${MAX_IMAGES_PER_TICKET}장까지 등록 가능합니다.` };
  }

  try {
    const formData = new FormData();
    formData.append("ticketId", ticketId);
    formData.append("file", file);
    formData.append("description", meta.description ?? "");
    formData.append("isCustomer", String(meta.is_customer ?? false));

    return await uploadTicketImageAction(formData);
  } catch (err) {
    console.error("Image processing failed:", err);
    return { uploaded: null, error: "이미지 처리 중 오류가 발생했습니다." };
  }
}

/** 파일 유효성 검사 */
export function validateImageFiles(files: File[]): string | null {
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (서버 액션 bodySizeLimit 와 일치)
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `지원하지 않는 파일 형식입니다: ${file.name}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `파일 크기가 너무 큽니다 (최대 10MB): ${file.name}`;
    }
  }
  return null;
}

export { MAX_IMAGES_PER_TICKET };
