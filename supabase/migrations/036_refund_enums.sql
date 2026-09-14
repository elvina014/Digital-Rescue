-- =============================================================
-- 036_refund_enums.sql
-- 환불 시스템 ENUM 타입 (환불 정책 Phase 1-1)
-- =============================================================
-- 주의: ALTER TYPE ... ADD VALUE 로 추가한 값은 같은 트랜잭션 안에서
--      곧바로 사용할 수 없다. 그래서 ENUM 정의만 이 파일에 두고,
--      이를 사용하는 테이블/트리거/RPC는 037 이후로 분리한다.
--      (004번 마이그레이션과 동일한 이유)
-- =============================================================

-- 1) 기존 payment_status 확장
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'REFUNDED';

-- 2) 환불 사유 코드
DO $$ BEGIN
  CREATE TYPE refund_reason AS ENUM (
    'QUALITY',        -- 수리 품질 하자 · 증상 재발      (회사 귀책)
    'REPAIR_FAILED',  -- 수리 실패 · 원상복구            (회사 귀책)
    'OVERCHARGE',     -- 과다 · 오청구                   (회사 귀책)
    'DUPLICATE',      -- 중복 결제                       (회사 귀책)
    'COMPLAINT',      -- 고객 불만 · 응대 문제           (협의)
    'CHANGE_MIND',    -- 고객 단순 변심                  (고객 귀책)
    'OTHER'           -- 기타 (reason_note 필수)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) 환불 실행 방법
DO $$ BEGIN
  CREATE TYPE refund_method AS ENUM (
    'CARD_CANCEL',          -- 카드 승인취소 (전액)
    'CARD_PARTIAL_CANCEL',  -- 카드 부분취소
    'BANK_REFUND',          -- 계좌 송금
    'CASH'                  -- 현금 반환
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) 환불 처리 단계
DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM (
    'REQUESTED',  -- 요청됨   (CS · 팀장 · 관리자)
    'APPROVED',   -- 승인됨   (팀장 · 관리자)
    'COMPLETED',  -- 완료됨   — 이 시점에만 매출에서 차감된다
    'REJECTED',   -- 반려됨
    'VOID'        -- 무효처리 (오등록 정정, 관리자 전용)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5) 부품 회수 여부
DO $$ BEGIN
  CREATE TYPE parts_recovery AS ENUM (
    'RECOVERED',      -- 회수함 — 적출품 등록 프로세스로 재고 복구
    'NOT_RECOVERED',  -- 회수 안 함 — 자재비 공제 또는 손실 처리
    'NONE'            -- 해당 없음 — 회수 대상 부품이 없는 건
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
