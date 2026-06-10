# IT 최신 뉴스 자동 수집·게시 (n8n + OpenRouter + Supabase)

메인 페이지 `디지털 자료실 > IT 최신 뉴스`를 5일에 한 번 자동 갱신하는 파이프라인 가이드.

## 전체 흐름

```
[n8n 워크플로 1: 수집 — 5일 주기]
  Schedule(5일) → RSS 수집 → 중복 제거(source_url) → OpenRouter(Claude)로 톤 재작성
    → Supabase news_items 에 status='draft' INSERT → Telegram 알림(공개/보관 버튼)

[n8n 워크플로 2: 게시 — Telegram 콜백]
  Telegram 버튼 탭 → status 변경(published/archived) → /api/revalidate 호출(즉시 반영)
```

- 사이트는 `news_items` 테이블에서 `status='published'` 만 최신순으로 노출(최대 40건, 4건씩 페이지네이션).
- 코드/DB 측은 이미 구현 완료. **아래는 운영자(=당신)가 직접 해야 하는 설정.**

---

## 0. 이미 완료된 것 (참고)

- DB 테이블 `public.news_items` 생성 + RLS + 기존 뉴스 4건 시드 (마이그레이션 `033_news_items.sql`, 원격 DB 적용됨).
- 메인 페이지가 `news_items`에서 라이브로 뉴스를 읽도록 변경.
- 재검증 라우트 `GET /api/revalidate`.
- CMS 뉴스 관리 화면 `edit.digital-rescue.com/editor/news` (검수·공개·수정·삭제).

---

## 1. 앱 배포 & 환경변수 (당신 작업)

### 1-1. 코드 배포
프로젝트 루트의 변경 사항을 커밋 → 푸시 → Vercel 자동 배포.

### 1-2. Vercel 환경변수 추가
Vercel → 프로젝트 → Settings → Environment Variables:

| 키 | 값 | 비고 |
|---|---|---|
| `REVALIDATE_SECRET` | 임의의 긴 랜덤 문자열 | n8n과 공유. 예) `openssl rand -hex 24` |

추가 후 **재배포**해야 적용됩니다.

### 1-3. 동작 확인
```
https://digital-rescue.com/api/revalidate?secret=<REVALIDATE_SECRET>
→ {"revalidated":true,...}  (secret 틀리면 401)
```

---

## 2. n8n 준비물 (자격증명/환경변수)

n8n에 아래 값을 자격증명 또는 환경변수로 등록:

| 이름 | 용도 | 발급처 |
|---|---|---|
| `OPENROUTER_API_KEY` | Claude 호출 | openrouter.ai → Keys |
| `SUPABASE_URL` | `https://wnddkgeohcgcidoklrps.supabase.co` | 고정 |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS 우회 INSERT/UPDATE | Supabase → Settings → API → **service_role** (비공개!) |
| `TELEGRAM_BOT_TOKEN` | 알림/버튼 | 기존 접수 알림 봇 재사용 가능 |
| `TELEGRAM_CHAT_ID` | 수신 대상 | 본인 chat id |
| `REVALIDATE_SECRET` | 게시 후 캐시 무효화 | 1-2와 동일 값 |
| `SITE_URL` | `https://digital-rescue.com` | 고정 |

> `service_role` 키는 모든 RLS를 우회합니다. n8n 서버에만 두고 절대 외부 노출 금지.

---

## 3. 워크플로 1 — 수집 (5일 주기)

### 3-1. Schedule Trigger
- 모드: **Interval**, 단위 **Days**, 값 **5** (시각 예: 오전 8시).
- (크론 표현식 `0 8 */5 * *` 는 매월 말일에 간격이 어긋나므로 Interval 권장.)

### 3-2. RSS 수집 (RSS Read 노드)
가장 안정적인 단일 소스로 **Google News RSS(IT, 최근 5일)** 권장:
```
https://news.google.com/rss/search?q=IT%20OR%20노트북%20OR%20데이터복구%20when:5d&hl=ko&gl=KR&ceid=KR:ko
```
선택적으로 매체 RSS를 추가 후 Merge:
- 전자신문(ET News) IT 섹션, ZDNet Korea, Bloter 등 (각 매체의 RSS URL은 사이트에서 확인).

### 3-3. 정렬 + 건수 제한
- Sort: pubDate 내림차순.
- Limit: **회당 1~3건** (한 번에 너무 많이 올리지 않도록).

### 3-4. 중복 제거 (이미 수집한 기사 제외)
각 후보의 `link`(원문 URL)로 Supabase 조회 — HTTP Request 노드:
```
GET  {{$env.SUPABASE_URL}}/rest/v1/news_items?source_url=eq.{{ encodeURIComponent($json.link) }}&select=id
Headers:
  apikey:        {{$env.SUPABASE_SERVICE_ROLE_KEY}}
  Authorization: Bearer {{$env.SUPABASE_SERVICE_ROLE_KEY}}
```
응답 배열이 비어있지 않으면(=이미 존재) **IF 노드로 드롭**. (테이블의 `source_url UNIQUE`가 최종 안전망이라 중복 INSERT는 어차피 거부됩니다.)

### 3-5. OpenRouter 로 톤 재작성 (HTTP Request 노드)
```
POST https://openrouter.ai/api/v1/chat/completions
Headers:
  Authorization: Bearer {{$env.OPENROUTER_API_KEY}}
  Content-Type:  application/json
  HTTP-Referer:  https://digital-rescue.com      (선택)
  X-Title:       Digital Rescue News             (선택)
Body (JSON):
{
  "model": "anthropic/claude-3.5-haiku",
  "response_format": { "type": "json_object" },
  "messages": [
    {
      "role": "system",
      "content": "당신은 IT 수리·데이터복구 전문기업 '디지털레스큐'의 콘텐츠 에디터입니다. 입력된 IT 뉴스를 일반 고객이 이해하기 쉬운 한국어로 요약·재작성합니다. 규칙: (1) 반드시 사실에 근거하고 원문에 없는 수치·주장을 지어내지 말 것. (2) 마지막 문단에 수리/데이터 보존/예방 관점의 한두 문장을 자연스러울 때만 덧붙이고, 억지스러우면 생략. (3) 과장 광고 금지. (4) 반드시 JSON 객체만 출력."
    },
    {
      "role": "user",
      "content": "다음 기사를 가공해 JSON으로만 답하세요.\n\n제목: {{ $json.title }}\n출처: {{ $json.source }}\n원문URL: {{ $json.link }}\n발췌: {{ $json.contentSnippet || $json.content }}\n\n출력 형식: {\"title\": \"다듬은 제목\", \"summary\": \"한 문장 요약(80자 내외)\", \"body\": \"2~3문단. 문단 사이는 빈 줄(\\n\\n)로 구분\"}"
    }
  ]
}
```
- 응답에서 `choices[0].message.content`(JSON 문자열)를 파싱 → `title / summary / body` 추출.
- `claude-3.5-haiku`가 저렴·빠릅니다. 품질을 더 원하면 `anthropic/claude-3.7-sonnet` 등으로 교체.

### 3-6. Supabase 에 draft 적재 (HTTP Request 노드)
```
POST {{$env.SUPABASE_URL}}/rest/v1/news_items
Headers:
  apikey:        {{$env.SUPABASE_SERVICE_ROLE_KEY}}
  Authorization: Bearer {{$env.SUPABASE_SERVICE_ROLE_KEY}}
  Content-Type:  application/json
  Prefer:        return=representation
Body (JSON):
{
  "title":      "{{ 파싱한 title }}",
  "summary":    "{{ 파싱한 summary }}",
  "body":       "{{ 파싱한 body }}",
  "source":     "{{ $json.source }}",
  "source_url": "{{ $json.link }}",
  "news_date":  "{{ $now.format('yyyy-MM-dd') }}",
  "status":     "draft"
}
```
- 응답(return=representation)에서 새 행의 `id`를 받아 Telegram 버튼에 사용.
- `news_date`는 기사 발행일이 있으면 그 값을, 없으면 오늘 날짜를 사용.

### 3-7. Telegram 알림 (HTTP Request 노드)
```
POST https://api.telegram.org/bot{{$env.TELEGRAM_BOT_TOKEN}}/sendMessage
Body (JSON):
{
  "chat_id": "{{$env.TELEGRAM_CHAT_ID}}",
  "parse_mode": "HTML",
  "text": "📰 <b>새 뉴스 초안</b>\n\n<b>{{title}}</b>\n{{summary}}\n\n출처: {{source}}",
  "reply_markup": {
    "inline_keyboard": [[
      { "text": "✅ 공개", "callback_data": "publish:{{id}}" },
      { "text": "🗑 보관", "callback_data": "archive:{{id}}" },
      { "text": "✏️ 수정", "url": "https://edit.digital-rescue.com/editor/news" }
    ]]
  }
}
```
- `callback_data`는 64바이트 제한 — `publish:<uuid>` 형태면 안전.

---

## 4. 워크플로 2 — 게시 처리 (Telegram 콜백)

### 4-1. Telegram Trigger
- Updates: **callback_query** 활성화. (워크플로 1과 같은 봇 토큰.)

### 4-2. callback_data 파싱
`{{ $json.callback_query.data }}` → `:` 기준으로 `action`(publish|archive) 과 `id` 분리.

### 4-3. 분기 (Switch)

**publish:**
```
PATCH {{$env.SUPABASE_URL}}/rest/v1/news_items?id=eq.{{id}}
Headers: apikey / Authorization: Bearer (service_role), Content-Type: application/json, Prefer: return=minimal
Body: { "status": "published", "published_at": "{{ $now.toISO() }}" }
```
→ 이어서 캐시 무효화:
```
GET {{$env.SITE_URL}}/api/revalidate?secret={{$env.REVALIDATE_SECRET}}
```

**archive:**
```
PATCH {{$env.SUPABASE_URL}}/rest/v1/news_items?id=eq.{{id}}
Body: { "status": "archived" }
```

### 4-4. 콜백 응답 (필수)
```
POST https://api.telegram.org/bot{{$env.TELEGRAM_BOT_TOKEN}}/answerCallbackQuery
Body: { "callback_query_id": "{{ $json.callback_query.id }}", "text": "처리되었습니다" }
```
- (선택) `editMessageReplyMarkup`로 버튼을 제거해 중복 클릭 방지.

---

## 5. 테스트 체크리스트

1. `/api/revalidate?secret=...` 가 `revalidated:true` 반환.
2. 워크플로 1 수동 실행 → `news_items`에 draft 1건 생성 + Telegram 알림 도착.
3. Telegram **✅공개** 탭 → 메인 페이지 새로고침 시 뉴스 목록 최상단에 노출.
4. `edit.digital-rescue.com/editor/news` 에서 draft/published 목록·수정·삭제 동작.
5. 같은 기사가 다음 주기에 다시 들어와도 중복 INSERT 안 됨(`source_url` UNIQUE).

---

## 6. 운영 팁

- **품질이 안정될 때까지는 Telegram 공개 버튼/CMS 검수**를 거치세요. 신뢰가 쌓이면 워크플로 1의 INSERT를 `status='published'`로 바꿔 완전 자동화할 수 있습니다(검수 생략).
- 노출 건수(40)·페이지당 개수(4)는 `src/components/main/DigitalResourcesSection.tsx`의 `NEWS_PER_PAGE`, `src/lib/news.ts`의 `PUBLISHED_NEWS_LIMIT`에서 조정.
- 오래된 뉴스는 CMS에서 **보관(archived)** 처리하면 목록에서 빠지되 이력은 남습니다.
