-- =============================================
-- 013_inventory_transactions.sql
-- inventory_transactions 테이블 생성
-- 재고 입출고 이력 관리
-- =============================================

-- transaction_type Enum
DO $$ BEGIN
  CREATE TYPE inventory_transaction_type AS ENUM ('INBOUND', 'OUTBOUND', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- inventory_transactions 테이블
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          UUID         NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  user_id          UUID                  REFERENCES employees(id)       ON DELETE SET NULL,
  transaction_type inventory_transaction_type NOT NULL,
  quantity_changed INTEGER      NOT NULL,               -- 양수: 입고, 음수도 허용(조정)
  ticket_id        UUID                  REFERENCES repair_tickets(id)  ON DELETE SET NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  inventory_transactions                    IS '재고 입출고 이력';
COMMENT ON COLUMN inventory_transactions.transaction_type   IS 'INBOUND: 입고, OUTBOUND: 출고, ADJUSTMENT: 수동조정';
COMMENT ON COLUMN inventory_transactions.quantity_changed   IS '변경 수량 (OUTBOUND이면 양수로 저장, 차감 의미)';
COMMENT ON COLUMN inventory_transactions.ticket_id          IS '연관 수리 티켓 (없으면 NULL)';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_inv_tx_item_id    ON inventory_transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_user_id    ON inventory_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_ticket_id  ON inventory_transactions(ticket_id);
CREATE INDEX IF NOT EXISTS idx_inv_tx_created_at ON inventory_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_tx_type       ON inventory_transactions(transaction_type);

-- =============================================
-- Row Level Security
-- =============================================
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

-- 조회: ADMIN / MANAGER
DROP POLICY IF EXISTS inv_tx_select ON inventory_transactions;
CREATE POLICY inv_tx_select ON inventory_transactions
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('ADMIN', 'MANAGER'));

-- 입력: ADMIN / MANAGER (또는 SECURITY DEFINER 함수)
DROP POLICY IF EXISTS inv_tx_insert ON inventory_transactions;
CREATE POLICY inv_tx_insert ON inventory_transactions
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('ADMIN', 'MANAGER'));
