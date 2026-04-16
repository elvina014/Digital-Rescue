"use client";

import imageCompression from "browser-image-compression";
import { createClient } from "@/utils/supabase/client";

const MAX_IMAGES_PER_TICKET = 12;
const BUCKET = "ticket-images";

/** 압축 옵션: 최대 1MB, 최대 1920px, WebP 변환 */
const COMPRESSION_OPTIONS: Parameters<typeof imageCompression>[1] = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: "image/webp",
};

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
 * 이미지를 브라우저에서 WebP로 압축 후 Supabase Storage에 업로드합니다.
 * @param ticketId 티켓 ID (스토리지 폴더 경로로 사용)
 * @param file 업로드할 File (1장)
 * @param existingCount 이미 업로드된 이미지 수
 * @param meta 메타데이터 (description, uploader_name 등)
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

  const supabase = createClient();

  try {
    // 1) 압축 + WebP 변환
    const compressed = await imageCompression(file, COMPRESSION_OPTIONS);

    // 2) 고유 파일명 생성
    const timestamp = Date.now();
    const safeName = file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 40);
    const filePath = `${ticketId}/${timestamp}_${safeName}.webp`;

    // 3) Supabase Storage 업로드
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, compressed, {
        contentType: "image/webp",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload failed:", uploadError);
      return { uploaded: null, error: uploadError.message };
    }

    // 4) Public URL 가져오기
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(filePath);

    const image: TicketImage = {
      path: filePath,
      url: urlData.publicUrl,
      description: meta.description || "",
      uploaded_by: meta.uploaded_by || "customer",
      uploader_name: meta.uploader_name || "고객",
      uploaded_at: new Date().toISOString(),
      is_customer: meta.is_customer ?? true,
    };

    return { uploaded: image };
  } catch (err) {
    console.error("Image processing failed:", err);
    return { uploaded: null, error: "이미지 처리 중 오류가 발생했습니다." };
  }
}

/** 파일 유효성 검사 */
export function validateImageFiles(files: File[]): string | null {
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB (압축 전 원본 제한)
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `지원하지 않는 파일 형식입니다: ${file.name}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `파일 크기가 너무 큽니다 (최대 20MB): ${file.name}`;
    }
  }
  return null;
}

export { MAX_IMAGES_PER_TICKET };
