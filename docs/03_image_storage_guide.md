# 이미지 스토리지 설정 가이드

## 1. Supabase Storage 버킷 생성

Supabase Dashboard → Storage → New Bucket:

- **Name**: `ticket-images`
- **Public**: ✅ (이미지 URL로 직접 접근 허용)
- **File size limit**: `20MB`
- **Allowed MIME types**: `image/jpeg, image/png, image/webp, image/heic, image/heif`

## 2. Storage RLS 정책 (SQL Editor에서 실행)

```sql
-- 1) 누구나 이미지 조회 가능 (퍼블릭 버킷)
CREATE POLICY "ticket_images_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-images');

-- 2) 인증된 직원만 업로드 가능
CREATE POLICY "ticket_images_auth_insert"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ticket-images'
  AND auth.role() = 'authenticated'
);

-- 3) 인증된 직원만 삭제 가능
CREATE POLICY "ticket_images_auth_delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'ticket-images'
  AND auth.role() = 'authenticated'
);
```

> **참고**: 고객 접수 폼(비인증)은 `createAdminClient()`(service_role)를 통해
> 서버 액션에서 업로드하므로 RLS를 우회합니다.

## 3. DB 마이그레이션 (images 컬럼)

```sql
-- supabase/migrations/006_add_images_column.sql
ALTER TABLE repair_tickets
  ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]';
```

images 컬럼 형식:
```json
[
  { "path": "ticket-id/1234567890_photo.webp", "url": "https://xxx.supabase.co/storage/v1/object/public/ticket-images/..." }
]
```

## 4. 이미지 보관 정책

### 취소(CANCELED) 시 자동 삭제
- `cancelTicketAction`에서 Storage 파일 삭제 + DB `images: []` 초기화
- 이미 구현 완료 (`src/app/(admin)/tickets/actions.ts`)

### 완료(COMPLETED) 90일 보관 후 삭제 (선택사항)

#### 방법 A: pg_cron (Supabase Pro 플랜)

```sql
-- pg_cron 확장 활성화
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 매일 새벽 3시에 90일 경과 완료건 이미지 정보 정리
SELECT cron.schedule(
  'cleanup-old-ticket-images',
  '0 3 * * *',
  $$
    UPDATE repair_tickets
    SET images = '[]'::jsonb
    WHERE status = 'COMPLETED'
      AND updated_at < NOW() - INTERVAL '90 days'
      AND images != '[]'::jsonb;
  $$
);
```

> ⚠️ pg_cron은 DB 레코드만 정리합니다. Storage 파일 삭제는
> 아래 Edge Function을 병행해야 합니다.

#### 방법 B: Supabase Edge Function (권장)

`supabase/functions/cleanup-old-images/index.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 90일 경과 완료건 조회
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const { data: tickets } = await supabase
    .from("repair_tickets")
    .select("id, images")
    .eq("status", "COMPLETED")
    .lt("updated_at", cutoff.toISOString())
    .neq("images", "[]");

  if (!tickets?.length) {
    return new Response("No tickets to clean up");
  }

  for (const ticket of tickets) {
    const images = ticket.images as { path: string }[];
    if (images.length > 0) {
      const paths = images.map((img) => img.path);
      await supabase.storage.from("ticket-images").remove(paths);
      await supabase
        .from("repair_tickets")
        .update({ images: [] })
        .eq("id", ticket.id);
    }
  }

  return new Response(`Cleaned ${tickets.length} tickets`);
});
```

Supabase Dashboard → Edge Functions → Cron에서 매일 실행 예약:
```
0 3 * * *
```

## 5. 파일 구조 요약

| 파일 | 역할 |
|------|------|
| `src/lib/imageUpload.ts` | 클라이언트 압축(WebP) + Storage 업로드 |
| `src/components/common/ImageUploader.tsx` | 드래그&드롭 + 미리보기 UI |
| `src/components/common/Lightbox.tsx` | 전체화면 이미지 뷰어 |
| `src/app/(admin)/tickets/actions.ts` | 이미지 추가/삭제/취소시정리 서버액션 |
| `src/app/actions/ticketActions.ts` | 고객 접수 시 이미지 업로드 (서버) |

## 6. 제한 사항

- 티켓당 최대 **12장**
- 고객 접수 폼: 최대 **2장**
- 파일 크기: 업로드 전 **1MB**로 압축 (관리자), 원본 그대로 **20MB** 제한 (고객)
- 지원 형식: JPEG, PNG, WebP, HEIC, HEIF
