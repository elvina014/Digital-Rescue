-- 005: repair_tickets에 관리자 메시지 플래그 추가
ALTER TABLE repair_tickets
ADD COLUMN IF NOT EXISTS has_admin_message BOOLEAN NOT NULL DEFAULT FALSE;
