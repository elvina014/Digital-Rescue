# 랜딩 개편 Phase 0 — CTA 클릭 계측 (기준선 측정)

디자인·문구를 바꾸기 전에 지금 페이지의 전환 현황을 숫자로 남겨 두는 단계다.
개편 후 같은 화면에서 전·후를 비교한다. 최소 2주 동안 쌓은 뒤 Phase 1로 넘어간다.

## 무엇을 기록하나

| event_type | 의미 | 판별 기준 |
|---|---|---|
| `phone` | 전화 버튼 클릭 | 링크가 `tel:` 로 시작 |
| `kakao` | 카카오톡 버튼 클릭 | 링크 주소에 `kakao.com` 포함 |
| `contact` | 접수 섹션 이동 버튼 클릭 ("무료 견적 받기", 헤더 "접수하기" 등) | 링크가 `#contact` |
| `form_submit` | 온라인 접수 완료 | 접수폼 서버 처리 성공 시 |

이벤트마다 함께 저장하는 값:

- `location`: 클릭 위치. `[data-cta-area]` → 가장 가까운 `section[id]` → header/footer 순으로 정한다.
  예: `header`, `hero`, `brand-intro`, `process`, `footer`, `mobile_cta`, `contact_form`
- `page_path`, `brand_slug`: 어느 페이지(브랜드 랜딩)에서 눌렀는지
- `device`: 화면 폭 768px 미만이면 `mobile`
- `session_id`: 브라우저 탭 단위 익명 ID (sessionStorage). "클릭한 방문자 수" 근사치용
- `ad_source`, `ad_keyword`, `referrer_host`: 그 탭에 처음 들어올 때의 유입 정보
  - `ad_source`: `utm_source` → 없으면 `NaPm`/`n_media` 있으면 `naver_ad`, `gclid` 있으면 `google_ad`
  - `ad_keyword`: `n_keyword` → `n_query` → `utm_term`

이름·전화번호 등 개인정보는 저장하지 않는다.

## 구조

```
브라우저 클릭
  └ CtaTracker (src/components/common/CtaTracker.tsx, (main) 레이아웃에 1개)
      └ trackCta() (src/lib/ctaTracking.ts) — sendBeacon
          └ POST /api/cta (src/app/api/cta/route.ts) — 같은 사이트 요청만, zod 검증
              └ public.cta_click_events (service_role 로 INSERT)
                  └ public.cta_daily_stats 뷰 (한국시간 일별 집계)
                      └ 관리자 포털 /stats/cta "CTA 클릭 현황" (ADMIN/MANAGER)
```

- CTA 링크는 CMS 데이터로 그려지므로 버튼마다 코드를 달지 않는다. 새 버튼을 CMS로 추가해도
  링크가 `tel:` / 카카오 / `#contact` 이면 자동으로 집계된다.
- 접수폼 완료만 `ContactForm` 성공 처리에서 직접 `trackCta("form_submit", "contact_form")` 를 부른다.
- 기록 저장이 실패해도 방문자 화면에는 영향이 없다 (API는 항상 204, 서버 로그에만 남김).

## 일별 확인 방법

관리자 포털 → 사이드바 **CTA 클릭 현황** (`/stats/cta`)

- 최근 7/30/90일 선택
- 상단 합계 카드 4개, 일별 표(전화/카톡/접수 버튼/접수 완료/모바일 비율/클릭한 방문자)
- 클릭 위치별 · 페이지별 · 유입 경로별 표

원본 기록은 행 단위로 계속 쌓이므로 날짜별 기록을 따로 저장하는 작업은 필요 없다.
엑셀로 보관하려면 Supabase SQL 편집기에서:

```sql
select * from cta_daily_stats order by day desc;
```

## 운영 적용 순서 (Brad)

1. 운영 DB에 `supabase/migrations/20261026090000_cta_click_events.sql` 적용
   (롤백: `supabase/test-fixtures/cta-click-events/rollback.sql`)
2. 코드 배포
3. 실기기(아이폰·갤럭시)로 홈페이지·브랜드 랜딩에서 전화/카톡 버튼을 눌러 본 뒤 `/stats/cta` 에 잡히는지 확인
4. 개편 전 기준선 기록 시작일을 이 문서 아래에 적어 둔다

마이그레이션을 적용하기 전에 배포하면 클릭은 저장되지 않고(`[api/cta] insert failed` 로그),
`/stats/cta` 에는 "마이그레이션이 DB에 적용됐는지 확인" 안내가 뜬다. 고객 화면은 정상 동작한다.

## 알려진 한계

- 직원이 사이트에서 누른 클릭도 함께 집계된다.
- `tel:` 클릭은 "전화 걸기 시도"이며 실제 통화 연결 여부는 알 수 없다.
- 같은 사람이 여러 번 누르면 여러 건으로 기록된다 (일별 표의 "클릭한 방문자"로 보정해서 본다).
- 공개 수집 API라 악의적 대량 요청을 완전히 막지는 못한다. 이상치가 보이면 IP 기반 제한을 추가한다.

## 기준선 기록

| 항목 | 값 |
|---|---|
| 계측 시작일 | (운영 적용 후 기입) |
| 기준선 기간 | 시작일부터 2주 |
