# 네이버 검색광고 API 사양 — 광고노출 제한 IP (0단계 조사)

> 조사일 2026-11-11. 공식 문서와 공식 GitHub 저장소에서 **직접 확인한 것만** "확인"으로 적었다.
> 공식 문서에 없는 것은 "미확인"으로 적고 추측하지 않았다. 실제 API는 호출하지 않았다.

## 결론

- 광고노출 제한 IP의 **목록·등록·수정·삭제 엔드포인트가 공식 API에 있다** (`/tool/ip-exclusions`). 구현 가능.
- **메모는 최대 25자**다(오류 5502). 요청서의 메모 형식 `[CG] <YYYY-MM-DD> <관리자명> <메모 앞 30자>`는 25자를 넘어 그대로는 등록할 수 없다 → 형식 결정 필요(아래 "결정이 필요한 것").
- IPv6, 와일드카드, 최대 개수(600), 호출 제한 수치, 오류 응답 본문 형식은 **공식 API 문서에 없다**.

## 출처

| # | 출처 | 내용 |
|---|---|---|
| S1 | https://naver.github.io/searchad-apidoc/#/guides | 서비스 URL, 키 발급 위치 |
| S2 | https://naver.github.io/searchad-apidoc/#/samples | 서명 규칙, 헤더, 예시 요청 |
| S3 | https://naver.github.io/searchad-apidoc/#/tags/IpExclusion | IpExclusion 리소스와 메서드 목록 |
| S4 | https://naver.github.io/searchad-apidoc/assets/json/ncc-heroes-tool.json | S3의 원본 Swagger 2.0 정의(필드 타입, 응답 코드) |
| S5 | https://github.com/naver/searchad-apidoc/blob/master/NaverSA_API_Error_Code_MAP.md | 오류 코드 표 |
| S6 | https://github.com/naver/searchad-apidoc (python-sample/examples/signaturehelper.py, ad_management_sample.py, php-sample/restapi.php, java-sample/.../util/Signatures.java, csharp-sample/SearchAdApi.cs) | 공식 샘플의 서명·호출 코드 |
| S7 | https://naver.github.io/searchad-apidoc/#/notice ([2020-12-18] 키워드 도구 429 가이드) | 호출 제한에 대한 유일한 공식 설명 |

## 1. 인증

**확인 (S1, S2, S6)**

- 서비스 URL: `https://api.searchad.naver.com`
- 키 발급: 광고주센터(manage.searchad.naver.com) > Tools > API Manager(문서 표기). `API-KEY`(액세스 라이선스)와 `API_SECRET`(비밀키)을 발급받는다.
- 요청 헤더

| 헤더 | 값 |
|---|---|
| `X-Timestamp` | Unix epoch **밀리초** (문서 예: `1457082455307`) |
| `X-API-KEY` | 발급받은 API 라이선스 |
| `X-Customer` | Customer ID (광고 계정 번호) |
| `X-Signature` | 아래 서명 |
| `Content-Type` | `application/json; charset=UTF-8` (공식 샘플이 모든 요청에 붙임) |

- 서명 규칙 (S2 원문): `sha256-hmac ( API_SECRET, Milliseconds since Unix Epoch + "." + http method + "." + request uri )`
  - 서명 대상 문자열 예 (S2): `1457082455307.GET./ncc/campaigns`
  - 결과는 **Base64** (S6: python `base64.b64encode(hash.digest())`, php `base64_encode(hash_hmac('sha256', …, true))`, java `printBase64Binary`).
  - METHOD는 대문자(`GET`/`POST`/`PUT`/`DELETE`).
- **uri에 쿼리스트링은 넣지 않는다 — 경로만 서명한다.** 문서에 문장으로 쓰여 있지는 않지만 공식 샘플 3종이 모두 그렇게 한다 (S6):
  - php: `getHeader('GET', $uri)`로 서명하고, URL은 `$uri . '?' . build_http_query($query)`로 따로 붙인다.
  - python: `get_header(method, uri, …)`에 `'/ncc/keywords'`만 넘기고 `params={…}`는 requests에 따로 넘긴다.
  - 경로 변수는 포함한다 (python: `uri = '/ncc/keywords/' + id`로 서명).
- 문서 예시 값 (S2): timestamp `1457082455307`, `X-API-KEY: 0100000000e5b6…47fa5`, `X-Customer: 338047`, `X-Signature: PY6keeelL+7HV+498Y83BLv4K65XJRxmfbnZYVzutCA=`.
  **이 예시에는 비밀키가 공개되어 있지 않아 서명 함수의 정답 검증에는 쓸 수 없다.** 단위 테스트는 규칙(`timestamp.METHOD.path` → HMAC-SHA256 → Base64)을 Node `crypto`로 독립 계산한 값과 비교하는 방식으로 한다.

**미확인**: 타임스탬프 허용 오차(서버 시각과 얼마나 차이 나면 거부되는지), 키의 IP 제한 여부.

## 2. 광고노출 제한 IP 엔드포인트

**확인 (S3, S4)** — 리소스 이름 `IpExclusion`

| 기능 | 요청 | 요청 본문 | 응답 (S4) |
|---|---|---|---|
| 목록 | `GET /tool/ip-exclusions` | 없음 (파라미터 없음, 페이지 구분 없음) | 200, `IpExclusion[]` |
| 등록 | `POST /tool/ip-exclusions` | `IpExclusion` 1건 (`filterIp`, `memo`) | 200 `IpExclusion` (201 Created도 정의됨) |
| 수정 | `PUT /tool/ip-exclusions` | `IpExclusion` 1건 (`ipFilterId`, `filterIp`, `memo`) | 200 `IpExclusion` |
| 삭제 | `DELETE /tool/ip-exclusions/{id}` | 없음. `id` = `ipFilterId` | 200 `IpExclusion` 또는 204 No Content |
| 여러 건 삭제 | `DELETE /tool/ip-exclusions?ids=…` | 없음. `ids`는 같은 이름을 반복(`collectionFormat: multi`) | 204 No Content |

공통 오류 응답 코드로 401, 403, 404가 정의되어 있다 (S4).
원본 Swagger의 경로는 `/api/tool/ip-exclusions`지만 공개 문서와 호출 경로는 `/tool/ip-exclusions`다 (S3).

### IpExclusion 필드 (S3, S4)

| 필드 | 타입 | 설명 (문서 원문) | 요청에 사용 |
|---|---|---|---|
| `ipFilterId` | long | The unique ID of the filter ip | 수정·삭제 시 |
| `filterIp` | string | The IP users want to filtering. | 등록 시 |
| `memo` | string | User memo of IP exclusion. **최대 25자 (S5, 오류 5502)** | 등록·수정 시 |
| `customerId` | long | The unique ID of the customer | 응답 전용 |
| `loginId` | string | The user login id of system. | 응답 전용 |
| `userId` | long | The user id of system. | 응답 전용 |
| `regTm` | datetime | 생성 시각 (RFC 3339) | 응답 전용 |

- 항목 ID는 **`ipFilterId` (숫자 long)**. DB에는 `naver_filter_id text`로 저장해도 문제없다.
- 문서에 필수/선택 표시는 없다. 등록 시 `ipFilterId`를 보내는지 여부도 적혀 있지 않다(등록 본문 표에 나열만 되어 있음) → 등록 때는 `filterIp`, `memo`만 보내는 것으로 구현하고 Brad의 실호출 테스트로 확인한다.

## 3. 제약과 오류

### 오류 코드 (S5, 확인)

| 코드 | 공식 한글 설명 | 이 기능에서의 의미 |
|---|---|---|
| 5501 | 잘못된 노출제한 ID값입니다. | 삭제·수정 대상 ID가 없음 |
| 5502 | 광고노출제한 관리 설명의 길이는 최대 25자까지 입력 가능합니다. | 메모 25자 초과 |
| 5503 | 이미 등록된 노출제한 IP입니다. | 중복 등록 |
| 1014 | 최대 허용개수를 초과하여 처리할 수 없습니다. | 등록 한도 초과로 추정되는 공통 코드 |
| 1016 | 너무 많은 접속을 시도 하였습니다. | 과다 호출 |
| 1018 / 1006 | 접근 권한이 없습니다. / 권한이 없습니다. | 권한 |
| 1002 / 1011 / 1015 | 잘못된 요청 / 잘못된 데이터 / 허용하지 않는 문자 | 입력 오류 |
| 429 | 요청이 많아 처리할 수 없습니다. | 호출 제한 |
| 503 | 정기점검이 진행 중입니다. | 점검 |

### 호출 제한 (S7, 확인된 것은 정성적 설명뿐)

- "사용량 제한은 호출 대상 계정당 속도 제한으로서 전체 서비스 사용량에 따라 유연한 형태" — **수치는 공개되어 있지 않다.**
- 429가 나오면 대기 후 재시도. 수 초 안에 429가 대량으로 반복되게 만들지 말 것. 그렇게 됐다면 최소 5분 이상 모든 호출을 멈출 것.
- 이 기능은 사람이 버튼을 누를 때만 1~3회 호출하므로(목록 → 등록/삭제) 제한에 걸릴 가능성은 낮다. 자동 재시도는 넣지 않는다.

### 미확인 (공식 API 문서·공식 저장소에 없음)

| 항목 | 상태 | 구현 시 처리안 |
|---|---|---|
| **IPv6 지원** | 문서에 언급 없음 | **IPv6는 거부**하고 "IPv4만 등록할 수 있습니다" 안내. Brad 실호출 테스트로 확인되면 그때 허용 |
| **와일드카드 형식** | API 문서에 없음. 비공식 블로그에 `123.123.123.*` 예시만 있음 | ERP에서는 단일 IPv4만 등록. 목록에 와일드카드 항목이 있을 수 있으므로 읽을 때는 문자열 그대로 다룸 |
| **최대 개수(600)** | API 문서에 없음. 비공식 블로그와 기존 화면 문구에만 있음. 초과 시 코드는 1014로 추정 | 요청서대로 ERP 자체 상한 500으로 막고, 1014도 "슬롯 부족"으로 변환 |
| **오류 응답 본문 형식** | 코드 표(S5)만 있고 JSON 구조는 문서에 없음 | HTTP 상태 + 본문의 `code` 숫자를 방어적으로 읽고(없어도 동작), 원문은 `cg_block_log.detail`에 저장 |
| 타임스탬프 허용 오차 | 문서에 없음 | 요청 직전에 `Date.now()`로 생성 |
| 등록 응답이 200인지 201인지 | 둘 다 정의됨 | 2xx면 성공으로 처리 |

네이버 광고 공식 도움말(ads.naver.com)은 조사 도구에서 접근이 차단되어 확인하지 못했다. 위 "미확인" 항목 중 600개·와일드카드·IPv6는 Brad가 광고주센터 도구 > 광고노출제한 관리 화면의 안내 문구로 확인할 수 있다.

## 결정이 필요한 것 (1단계 전에)

1. **메모 형식 (25자 제한)** — 요청서 형식은 날짜(10) + 관리자명 + 메모 30자로 25자를 넘는다.
   - 제안: `[CG] YYMMDD <사용자 메모 앞 13자>` (= 5 + 6 + 1 + 13 = 25자). 관리자명과 메모 전문은 `cg_block_log`와 `cg_ip_marks.memo`에 남긴다.
   - 해제 판정에 쓰는 표식은 `[CG]`로 시작하는지 여부이므로 그대로 유지된다.
2. **함수 권한** — 요청서의 "REVOKE PUBLIC/anon"은 R10/KI-8(anon·authenticated에서 EXECUTE를 빼앗으면 Postgres 재시작)과 충돌한다. 기존 Click Guard 함수와 같은 방식(`REVOKE ALL FROM PUBLIC` → `GRANT EXECUTE TO anon, authenticated, service_role`, 거부는 함수 내부 ADMIN 검사)으로 하겠다.
3. **IPv6** — 위 처리안(거부)으로 진행할지.
4. **수동 와일드카드 항목과의 겹침** — 네이버에 `1.2.3.*`가 수동 등록되어 있고 ERP에서 `1.2.3.4`를 등록하려는 경우, "이미 수동 대역으로 차단됨"으로 보고 등록하지 않을지(제안), 그대로 등록을 시도할지.
5. **SPEC 원칙 변경** — SPEC "후속 단계(보류)"의 "Vercel은 네이버 API를 절대 호출하지 않는다(n8n이 호출)"와 이번 요청(ERP 서버 액션이 직접 호출)이 다르다. 이번 요청을 따르고 1단계에서 SPEC에 변경 사실을 적겠다.
