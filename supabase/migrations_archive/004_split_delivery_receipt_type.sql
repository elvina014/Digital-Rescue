-- 004: receipt_type Enum에 QUICK, PARCEL 추가 및 DELIVERY → PARCEL 마이그레이션
-- 실행 순서: 반드시 아래 순서대로 Supabase SQL Editor에서 실행

-- 1) 새 값 추가 (PostgreSQL은 ADD VALUE가 트랜잭션 내에서 불가하므로 개별 실행)
ALTER TYPE receipt_type ADD VALUE IF NOT EXISTS 'QUICK';
ALTER TYPE receipt_type ADD VALUE IF NOT EXISTS 'PARCEL';

-- 2) 기존 DELIVERY 데이터를 PARCEL로 일괄 변환
-- PostgreSQL enum은 직접 UPDATE가 가능 (새 값이 이미 추가된 후)
UPDATE repair_tickets
SET receipt_type = 'PARCEL'
WHERE receipt_type = 'DELIVERY';

-- 참고: PostgreSQL은 ALTER TYPE ... DROP VALUE를 지원하지 않으므로
-- DELIVERY 값은 enum에 남아있지만 사용되지 않습니다.
-- 완전 제거가 필요하면 enum을 재생성해야 합니다.
