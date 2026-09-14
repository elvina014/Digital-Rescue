데이터베이스 스키마 설계 (Database Schema)(중략... 이전 1~2, 3.1~3.2 항목 동일)3.3 repair_tickets (수리 접수건 테이블)필드명타입제약 조건설명idUUIDPK접수건 고유 IDcustomer_idUUIDFK(customers.id)접수 고객assignee_idUUIDFK(employees.id), NULL배정된 담당기사statusTicketStatusDEFAULT 'NEW'현재 처리 상태receipt_typeReceiptTypeNOT NULL접수 방식device_brandVARCHARNOT NULL브랜드명device_modelVARCHARNULL기기 모델명symptomsTEXTNOT NULL고장 증상 및 문의 내용initial_estimateINTEGERDEFAULT 0시스템 산출 최소 견적expected_estimateINTEGERDEFAULT 0예상 견적material_costINTEGERDEFAULT 0자재비 총합material_cost_detailsJSONBDEFAULT '[]'자재비 상세 내역final_priceINTEGERDEFAULT 0최종 확정 견적is_approvedBOOLEANDEFAULT FALSE회사 최종 승인 여부payment_statusVARCHARDEFAULT 'PENDING'결제 상태payment_methodVARCHARNULL결제 방식has_admin_messageBOOLEANDEFAULT FALSE관리자 메시지 여부imagesJSONBDEFAULT '[]'[수정] 업로드된 이미지 정보 목록 (최대 12장). 상세 구조는 아래 참조created_atTIMESTAMPTZDEFAULT NOW()접수 일시updated_atTIMESTAMPTZDEFAULT NOW()마지막 수정 일시images JSONB 배열의 객체 구조 정의:[
  {
    "url": "https://...",
    "path": "ticket-images/...",
    "description": "액정 파손 부위", 
    "uploaded_by": "uuid_or_customer",
    "uploader_name": "홍길동 기사",
    "uploaded_at": "2024-05-20T10:30:00Z",
    "is_customer": false
  }
]
(이하 생략)

# 환불 시스템 (마이그레이션 035~040)

정책 상세는 `docs/05_refund_policy.md` 참조.

## 추가 ENUM

| 타입 | 값 |
| --- | --- |
| `payment_status` (확장) | `PENDING`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED` |
| `refund_reason` | `QUALITY`, `REPAIR_FAILED`, `OVERCHARGE`, `DUPLICATE`, `COMPLAINT`, `CHANGE_MIND`, `OTHER` |
| `refund_method` | `CARD_CANCEL`, `CARD_PARTIAL_CANCEL`, `BANK_REFUND`, `CASH` |
| `refund_status` | `REQUESTED`, `APPROVED`, `COMPLETED`, `REJECTED`, `VOID` |
| `parts_recovery` | `RECOVERED`, `NOT_RECOVERED`, `NONE` |

> `ALTER TYPE ... ADD VALUE`로 추가한 값은 같은 트랜잭션에서 즉시 사용할 수 없다.
> 그래서 ENUM 정의(`036`)와 이를 사용하는 DDL(`037`)을 파일로 분리했다.

## repair_tickets 추가 컬럼

| 필드명 | 타입 | 제약 조건 | 설명 |
| --- | --- | --- | --- |
| `paid_at` | TIMESTAMPTZ | NULL | 결제 완료 시각 (최종 승인 시 기록) |
| `cash_receipt_issued` | BOOLEAN | NULL | 현금영수증 발급 여부. 계좌이체 건만 입력. NULL = 해당없음 또는 미확인(기능 도입 이전 건) |
| `refunded_amount` | INTEGER | NOT NULL DEFAULT 0 | 누적 환불액. `COMPLETED` 환불의 합계. **트리거가 갱신하므로 직접 쓰지 않는다** |

제약: `chk_refunded_amount` — `refunded_amount >= 0 AND refunded_amount <= final_price`

## ticket_refunds (환불 원장 테이블)

append-only. 수정·삭제하지 않으며, 오등록은 `VOID` 레코드로 무효화한 뒤 재등록한다.

| 필드명 | 타입 | 제약 조건 | 설명 |
| --- | --- | --- | --- |
| `id` | UUID | PK | 환불 레코드 ID |
| `ticket_id` | UUID | FK(repair_tickets.id), ON DELETE RESTRICT | 대상 접수건 |
| `refund_no` | VARCHAR(24) | NOT NULL, UNIQUE | 환불번호 `R-YYYYMMDD-NNN` (한국시간, 일별 리셋) |
| `amount` | INTEGER | NOT NULL, > 0 | 실제 고객에게 돌려주는 금액 |
| `deduction_amount` | INTEGER | NOT NULL DEFAULT 0 | 공제액 (회수 불가 자재비·외주비 등) |
| `deduction_note` | TEXT | NULL | 공제 사유. 공제액 > 0이면 필수 |
| `reason_code` | refund_reason | NOT NULL | 환불 사유 코드 |
| `reason_note` | TEXT | NULL | 상세 사유. `OTHER`면 필수 |
| `origin_payment_method` | VARCHAR(20) | NOT NULL | 원 결제수단 스냅샷 (티켓 값이 바뀌어도 원장은 불변) |
| `refund_method` | refund_method | NOT NULL | 환불 실행 방법 |
| `refund_bank` | VARCHAR(50) | NULL | 환불 계좌 은행 |
| `refund_account` | VARCHAR(50) | NULL | 환불 계좌번호 |
| `refund_holder` | VARCHAR(100) | NULL | 예금주 |
| `cash_receipt_cancel_required` | BOOLEAN | NOT NULL DEFAULT FALSE | 원 거래가 현금영수증 발급 건이면 TRUE |
| `cash_receipt_canceled_at` | TIMESTAMPTZ | NULL | 발급취소 확인 시각 |
| `parts_recovery` | parts_recovery | NOT NULL DEFAULT 'NONE' | 부품 회수 여부 |
| `status` | refund_status | NOT NULL DEFAULT 'REQUESTED' | 처리 단계 |
| `evidence` | JSONB | NOT NULL DEFAULT '[]' | 증빙 이미지 목록. 구조는 `repair_tickets.images`와 동일 |
| `requested_by` / `requested_at` | UUID / TIMESTAMPTZ | NOT NULL | 요청자 · 요청 시각 |
| `approved_by` / `approved_at` | UUID / TIMESTAMPTZ | NULL | 승인자 · 승인 시각 |
| `completed_by` / `completed_at` | UUID / TIMESTAMPTZ | NULL | 완료 처리자 · 완료 시각 |
| `rejected_by` / `rejected_at` / `reject_note` | UUID / TIMESTAMPTZ / TEXT | NULL | 반려자 · 시각 · 사유 |
| `voided_by` / `voided_at` / `void_note` | UUID / TIMESTAMPTZ / TEXT | NULL | 무효처리자 · 시각 · 사유 |
| `created_at` / `updated_at` | TIMESTAMPTZ | NOT NULL DEFAULT now() | 생성 · 수정 시각 |

`employees`로 향하는 FK가 5개(`requested_by`, `approved_by`, `completed_by`, `rejected_by`, `voided_by`)이므로
PostgREST 조인 시 컬럼명을 명시해야 한다:

```
requester:requested_by ( name ), approver:approved_by ( name ), completer:completed_by ( name )
```

### CHECK 제약

| 이름 | 내용 |
| --- | --- |
| `chk_refund_bank_fields` | `BANK_REFUND`일 때만 은행·계좌번호·예금주가 모두 있어야 하고, 그 외에는 모두 NULL |
| `chk_deduction_note` | 공제액 > 0이면 공제 사유 필수 |
| `chk_reason_note` | `reason_code = 'OTHER'`이면 상세 사유 필수 |
| `chk_cash_receipt_cancel` | `COMPLETED` + 현금영수증 발급 건이면 `cash_receipt_canceled_at` 필수 |

## refund_no_sequence

환불번호 일별 순번 카운터 (`R-YYYYMMDD-NNN`의 `NNN`). `receipt_no_sequence`와 동일 패턴.
RLS는 켜두되 정책을 만들지 않고, `SECURITY DEFINER` 트리거 함수만 접근한다.

## 트리거 · 함수

| 이름 | 종류 | 설명 |
| --- | --- | --- |
| `generate_refund_no()` | BEFORE INSERT | 환불번호 자동 채번. `SECURITY DEFINER` (시퀀스 테이블 RLS 때문) |
| `sync_ticket_refunded_amount()` | AFTER INSERT/UPDATE/DELETE | `COMPLETED` 환불 합계를 `repair_tickets.refunded_amount`에 반영하고 `payment_status`를 `PAID`/`PARTIALLY_REFUNDED`/`REFUNDED`로 갱신 |
| `protect_approved_ticket()` | BEFORE UPDATE (수정됨) | 트랜잭션 로컬 GUC `app.refund_sync = 'on'`인 경우만 환불 동기화 UPDATE를 통과시킨다 |
| `request_refund(...)` | RPC | 환불 요청. 권한·상태·금액·수단 정합성 검증 |
| `transition_refund(...)` | RPC | `APPROVE`/`REJECT`/`COMPLETE`/`VOID` 단계 전환 |

RPC 두 개는 `authenticated`만 실행 가능하며 `anon`·`PUBLIC` 권한은 회수했다(`039`).
트리거 전용 함수 두 개는 실행 권한을 전면 회수했다 — 트리거 실행은 EXECUTE 권한을 검사하지 않는다.

## RLS

`ticket_refunds`에는 **SELECT 정책만** 존재한다. 쓰기는 위 RPC를 통해서만 가능하다.

| 직급 | 조회 범위 |
| --- | --- |
| `ADMIN`, `MANAGER`, `CS`, `RECEPTION` | 전체 |
| `TECHNICIAN`, `EXPERT_REPAIR` | 본인 배정 접수건의 환불만 |

# 취소 복원 보호 (마이그레이션 041)

| 이름 | 종류 | 설명 |
| --- | --- | --- |
| `protect_canceled_ticket()` | BEFORE UPDATE | `CANCELED`에서 벗어나는 `status` 변경을 ADMIN · MANAGER로 제한 |

`tickets_update` RLS는 TECHNICIAN/EXPERT_REPAIR에게 "본인 배정 건" UPDATE를 허용하므로,
담당기사가 본인에게 배정된 취소건의 status를 직접 되돌리는 경로가 열려 있었다. 이를 트리거로 막는다.

검사 범위는 취소 해제뿐이다. 아래는 그대로 통과한다:

- 취소 처리(`→ CANCELED`) — `OLD.status <> 'CANCELED'`
- 취소건의 다른 컬럼 변경 — `NEW.status = 'CANCELED'` (폐기 확인 `dispose_confirmed_at`, 취소 시 `images` 비우기 등)

`service_role`(admin 클라이언트)은 `auth.uid()`가 NULL이라 함께 차단된다.
취소 해제를 admin 클라이언트로 수행하는 코드 경로는 없다.
