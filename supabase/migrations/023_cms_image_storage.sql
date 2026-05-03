-- =============================================
-- 023_cms_image_storage.sql
-- CMS 에디터에서 업로드한 이미지를 보관할 Supabase Storage 버킷 + RLS 정책.
--
-- 모델:
--   bucket: page-content-images (public read, 10MB, 이미지 MIME 만 허용)
--   - 사이트 방문자는 https://{project}.supabase.co/storage/v1/object/public/page-content-images/{path}
--     형태의 public URL 로 직접 GET (RLS 검사 없이 CDN 으로 서빙)
--   - CMS 사용자(브라우저 클라이언트)는 RLS 통해 INSERT/UPDATE/DELETE
--     → ADMIN/MANAGER 만 허용 (page_contents 와 동일 정책)
-- =============================================


-- 1) 버킷 생성 (이미 있으면 무시)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'page-content-images',
  'page-content-images',
  true,
  10485760,                                                         -- 10MB
  ARRAY['image/webp','image/jpeg','image/png','image/gif','image/heic','image/heif']
)
ON CONFLICT (id) DO UPDATE
  SET public            = EXCLUDED.public,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- 2) RLS 정책 (storage.objects 는 기본적으로 RLS enabled)
--    같은 정책명이 이미 있으면 재실행 시 충돌하므로 미리 DROP.

DROP POLICY IF EXISTS page_content_images_select ON storage.objects;
DROP POLICY IF EXISTS page_content_images_insert ON storage.objects;
DROP POLICY IF EXISTS page_content_images_update ON storage.objects;
DROP POLICY IF EXISTS page_content_images_delete ON storage.objects;

-- 읽기: anon + authenticated (list 호출 또는 signed URL 발급용)
-- public bucket 자체는 RLS 없이 GET 가능하지만, 명시적으로 허용해 둠.
CREATE POLICY page_content_images_select
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'page-content-images');

-- 쓰기: 인증된 사용자 중 ADMIN/MANAGER 만
-- get_my_role() 은 001_initial_schema.sql 에서 public 스키마에 정의됨.
-- ::text 캐스팅으로 enum 값과 문자열 비교.
CREATE POLICY page_content_images_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'page-content-images'
    AND public.get_my_role()::text IN ('ADMIN', 'MANAGER')
  );

CREATE POLICY page_content_images_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'page-content-images'
    AND public.get_my_role()::text IN ('ADMIN', 'MANAGER')
  )
  WITH CHECK (
    bucket_id = 'page-content-images'
    AND public.get_my_role()::text IN ('ADMIN', 'MANAGER')
  );

CREATE POLICY page_content_images_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'page-content-images'
    AND public.get_my_role()::text IN ('ADMIN', 'MANAGER')
  );
