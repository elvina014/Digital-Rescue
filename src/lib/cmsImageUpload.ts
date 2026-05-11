"use client";

import imageCompression from "browser-image-compression";
import { createClient } from "@/utils/supabase/client";

/**
 * CMS 에디터 이미지 업로드 헬퍼.
 *
 * 동작:
 *   1) 클라이언트에서 webp 압축 (최대 1MB / 2400px)
 *   2) Supabase Storage 의 page-content-images 버킷으로 직접 업로드
 *      (브라우저 supabase 클라이언트 = 사용자 JWT 쿠키 → RLS 통과)
 *   3) public URL 반환 → Inspector 가 content_data JSON 의 image* 필드에 저장
 *
 * 권한: storage.objects RLS 정책이 ADMIN/MANAGER 만 INSERT 허용.
 *       (cms)/layout.tsx 가 이미 권한 차단하지만, DB-side 방어 한 겹 더.
 */

export const CMS_IMAGE_BUCKET = "page-content-images";

const COMPRESSION = {
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: "image/webp" as const,
};

const ALLOWED_INPUT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];

const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20MB 원본 (압축 전)

export interface UploadedImage {
  /** Storage 내부 경로 (cleanup/삭제용) */
  path: string;
  /** content_data 에 저장될 public URL */
  url: string;
}

export async function uploadCmsImage(file: File): Promise<UploadedImage> {
  // 1) 입력 검증
  if (!ALLOWED_INPUT_TYPES.includes(file.type)) {
    throw new Error(`지원하지 않는 파일 형식: ${file.type || "(unknown)"}`);
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("파일 크기가 너무 큽니다 (최대 20MB).");
  }

  // 2) 클라이언트 압축
  const compressed = await imageCompression(file, COMPRESSION);

  // 3) Storage 업로드 (충돌 방지: timestamp + random + 안전 파일명)
  const supabase = createClient();
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const safeName = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40) || "image";
  const path = `${ts}_${rand}_${safeName}.webp`;

  const { error } = await supabase.storage
    .from(CMS_IMAGE_BUCKET)
    .upload(path, compressed, {
      contentType: "image/webp",
      upsert: false,
    });

  if (error) {
    // 흔한 케이스: 버킷 미존재 / RLS 거부
    throw new Error(error.message || "Storage 업로드 실패");
  }

  // 4) public URL 발급
  const { data } = supabase.storage.from(CMS_IMAGE_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}
