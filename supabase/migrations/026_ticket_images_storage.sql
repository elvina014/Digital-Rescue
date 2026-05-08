-- =============================================
-- 026_ticket_images_storage.sql
-- 접수건 이미지를 보관할 Supabase Storage 버킷 + RLS 정책.
--
-- 모델:
--   bucket: ticket-images (public read, 10MB, 이미지 MIME 만 허용)
--   - 공개 접수 시 service_role 클라이언트(anon 사용자)가 업로드
--   - 관리자(ADMIN/MANAGER)가 조회/삭제 가능
-- =============================================

-- 1) 버킷 생성 (이미 있으면 업데이트)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-images',
  'ticket-images',
  true,
  10485760,                                                         -- 10MB
  ARRAY['image/webp','image/jpeg','image/png','image/gif','image/heic','image/heif']
)
ON CONFLICT (id) DO UPDATE
  SET public            = EXCLUDED.public,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;


-- 2) RLS 정책

DROP POLICY IF EXISTS ticket_images_select ON storage.objects;
DROP POLICY IF EXISTS ticket_images_insert ON storage.objects;
DROP POLICY IF EXISTS ticket_images_delete ON storage.objects;

-- 조회: public URL 표시를 위해 anon/authenticated 허용
CREATE POLICY ticket_images_select
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'ticket-images'
  );

-- 업로드: service_role 은 RLS 우회하므로 별도 정책 불필요.
-- 일반 인증 사용자 중 ADMIN/MANAGER 도 업로드 가능하게 허용.
CREATE POLICY ticket_images_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-images'
    AND public.get_my_role()::text IN ('ADMIN', 'MANAGER')
  );

-- 삭제: ADMIN/MANAGER 만
CREATE POLICY ticket_images_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'ticket-images'
    AND public.get_my_role()::text IN ('ADMIN', 'MANAGER')
  );
