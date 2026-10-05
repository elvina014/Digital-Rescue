-- =============================================================
-- Digital-Rescue 데이터베이스 스키마 생성 스크립트
-- Supabase (PostgreSQL) 전용
-- 문서 참조: docs/01_db_schema.md, docs/02_roles_permissions.md
-- =============================================================


-- =============================================
-- 1. Enum (열거형) 타입 생성
-- =============================================

-- 1.1 직원 권한 등급
CREATE TYPE employee_role AS ENUM (
  'ADMIN',           -- 관리자 (모든 권한)
  'MANAGER',         -- 팀장 (승인, 분쟁 조정, 전체 진행 관리)
  'RECEPTION',       -- 접수처 (신규 접수, 담당기사 배정)
  'TECHNICIAN',      -- 담당기사 (견적 산출, 고객 응대)
  'EXPERT_REPAIR',   -- 정밀수리팀 (복잡한 수리, 외주 관리)
  'CS'               -- 고객 서비스 (사후 관리, 불편 접수)
);

-- 1.2 접수건 처리 상태
CREATE TYPE ticket_status AS ENUM (
  'NEW',               -- 신규 접수 (담당자 미배정)
  'ASSIGNED',          -- 담당자 배정 완료
  'IN_PROGRESS',       -- 수리/점검 진행 중
  'WAITING_APPROVAL',  -- 자재비 및 견적 회사 승인 대기
  'COMPLETED',         -- 수리 완료 (결제 완료 및 출고)
  'CANCELED'           -- 수리 취소 (반출)
);

-- 1.3 접수 방식
CREATE TYPE receipt_type AS ENUM (
  'VISIT',      -- 방문 서비스
  'DELIVERY',   -- 퀵/택배 서비스
  'WALK_IN'     -- 내방 서비스
);

-- 1.4 재고 상태
CREATE TYPE inventory_condition AS ENUM (
  'NEW',        -- 신품
  'GOOD',       -- 양품 (중고 A급)
  'DEFECTIVE',  -- 불량품
  'SURPLUS'     -- 잉여 부품 (중고 B/C급)
);

-- 1.5 결제 상태
CREATE TYPE payment_status AS ENUM (
  'PENDING',    -- 결제 대기
  'PAID'        -- 결제 완료
);


-- =============================================
-- 2. 테이블 생성
-- =============================================

-- 2.1 직원 테이블 (Supabase Auth auth.users와 1:1 매핑)
CREATE TABLE employees (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  role       employee_role NOT NULL,
  phone      VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE employees IS '직원 프로필 테이블 - auth.users와 1:1 매핑';

-- 2.2 고객 테이블
CREATE TABLE customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL,
  phone      VARCHAR(20)  NOT NULL,
  address    VARCHAR(300),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE customers IS '고객 정보 테이블';

-- 2.3 모델별 견적 DB 테이블
CREATE TABLE device_models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand           VARCHAR(50)  NOT NULL,
  model_name      VARCHAR(200) NOT NULL,
  release_year    INTEGER      NOT NULL,
  release_price   INTEGER      NOT NULL,
  specs           JSONB,
  min_repair_cost INTEGER      NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE device_models IS '브랜드별 모델 정보 (최소 견적 자동 산출용)';

-- 2.4 수리 접수건 테이블 (핵심)
CREATE TABLE repair_tickets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      UUID         NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  assignee_id      UUID         REFERENCES employees(id) ON DELETE SET NULL,
  status           ticket_status   NOT NULL DEFAULT 'NEW',
  receipt_type     receipt_type    NOT NULL,
  device_brand     VARCHAR(50)     NOT NULL,
  device_model     VARCHAR(200),
  symptoms         TEXT            NOT NULL,
  initial_estimate INTEGER         NOT NULL DEFAULT 0,
  final_price      INTEGER         NOT NULL DEFAULT 0,
  is_approved      BOOLEAN         NOT NULL DEFAULT FALSE,
  payment_status   payment_status  NOT NULL DEFAULT 'PENDING',
  created_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ     NOT NULL DEFAULT now()
);

COMMENT ON TABLE repair_tickets IS '수리 접수건 - 가장 핵심적인 비즈니스 테이블';

-- 2.5 재고 관리 테이블
CREATE TABLE inventory (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_name  VARCHAR(200)        NOT NULL,
  condition  inventory_condition NOT NULL,
  quantity   INTEGER             NOT NULL DEFAULT 0,
  cost_price INTEGER             NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ         NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory IS '교환품, 불량품, 잉여 부품 자재 관리';

-- 2.6 처리 현황 및 로그 테이블 (타임라인)
CREATE TABLE ticket_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES repair_tickets(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ticket_logs IS '접수건 처리 과정 로그 (타임라인)';


-- =============================================
-- 3. 인덱스 생성 (조회 성능 최적화)
-- =============================================

CREATE INDEX idx_repair_tickets_customer   ON repair_tickets(customer_id);
CREATE INDEX idx_repair_tickets_assignee   ON repair_tickets(assignee_id);
CREATE INDEX idx_repair_tickets_status     ON repair_tickets(status);
CREATE INDEX idx_repair_tickets_brand      ON repair_tickets(device_brand);
CREATE INDEX idx_ticket_logs_ticket        ON ticket_logs(ticket_id);
CREATE INDEX idx_ticket_logs_employee      ON ticket_logs(employee_id);
CREATE INDEX idx_device_models_brand       ON device_models(brand);
CREATE INDEX idx_inventory_condition       ON inventory(condition);


-- =============================================
-- 4. updated_at 자동 갱신 트리거
-- =============================================

-- 범용 트리거 함수: updated_at을 현재 시각으로 갱신
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- repair_tickets 테이블에 트리거 적용
CREATE TRIGGER trg_repair_tickets_updated_at
  BEFORE UPDATE ON repair_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();


-- =============================================
-- 5. 비즈니스 로직 보호 트리거
-- =============================================

-- 5.1 승인 완료 후 금액/상태 수정 방지 (ADMIN 제외)
-- 승인된 티켓의 final_price 변경을 DB 레벨에서 차단
CREATE OR REPLACE FUNCTION protect_approved_ticket()
RETURNS TRIGGER AS $$
DECLARE
  current_role employee_role;
BEGIN
  -- 승인 완료 상태가 아니면 통과
  IF OLD.is_approved = FALSE THEN
    RETURN NEW;
  END IF;

  -- 현재 사용자의 직급 조회
  SELECT role INTO current_role
  FROM employees
  WHERE id = auth.uid();

  -- ADMIN은 모든 수정 허용
  IF current_role = 'ADMIN' THEN
    RETURN NEW;
  END IF;

  -- MANAGER는 is_approved 변경 외의 금액 변경은 차단
  IF current_role = 'MANAGER' THEN
    IF NEW.final_price <> OLD.final_price THEN
      RAISE EXCEPTION '승인 완료된 접수건의 금액은 수정할 수 없습니다.';
    END IF;
    RETURN NEW;
  END IF;

  -- 그 외 직급은 승인 완료 후 일체 수정 불가
  RAISE EXCEPTION '승인 완료된 접수건은 수정할 수 없습니다. (권한: %)' , current_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_protect_approved_ticket
  BEFORE UPDATE ON repair_tickets
  FOR EACH ROW
  EXECUTE FUNCTION protect_approved_ticket();

-- 5.2 견적 하한선 강제 (final_price >= initial_estimate)
-- final_price가 initial_estimate보다 낮으면 저장 거부
CREATE OR REPLACE FUNCTION enforce_minimum_price()
RETURNS TRIGGER AS $$
BEGIN
  -- final_price가 변경되지 않았으면 통과
  IF NEW.final_price = OLD.final_price THEN
    RETURN NEW;
  END IF;

  -- final_price가 0이면 아직 미입력 상태이므로 통과
  IF NEW.final_price = 0 THEN
    RETURN NEW;
  END IF;

  -- 최소 견적보다 낮은 금액 입력 시 차단
  IF NEW.final_price < NEW.initial_estimate THEN
    RAISE EXCEPTION '최종 견적(%)이 최소 견적(%)보다 낮습니다. 팀장의 예외 승인이 필요합니다.',
      NEW.final_price, NEW.initial_estimate;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_minimum_price
  BEFORE UPDATE ON repair_tickets
  FOR EACH ROW
  EXECUTE FUNCTION enforce_minimum_price();


-- =============================================
-- 6. Row Level Security (RLS) 설정
-- =============================================

-- 모든 테이블에 RLS 활성화
ALTER TABLE employees      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_models  ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_logs    ENABLE ROW LEVEL SECURITY;

-- ----- 헬퍼 함수: 현재 로그인 사용자의 직급 조회 -----
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS employee_role AS $$
  SELECT role FROM employees WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ===== 6.1 employees 테이블 RLS =====

-- 인증된 직원은 모든 직원 목록 조회 가능
CREATE POLICY employees_select ON employees
  FOR SELECT TO authenticated
  USING (true);

-- ADMIN만 직원 생성/수정/삭제 가능
CREATE POLICY employees_insert ON employees
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'ADMIN');

CREATE POLICY employees_update ON employees
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'ADMIN');

CREATE POLICY employees_delete ON employees
  FOR DELETE TO authenticated
  USING (get_my_role() = 'ADMIN');


-- ===== 6.2 customers 테이블 RLS =====

-- 인증된 직원은 고객 조회 가능
CREATE POLICY customers_select ON customers
  FOR SELECT TO authenticated
  USING (true);

-- ADMIN, MANAGER, RECEPTION은 고객 추가 가능
CREATE POLICY customers_insert ON customers
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('ADMIN', 'MANAGER', 'RECEPTION'));

-- ADMIN, MANAGER, RECEPTION은 고객 정보 수정 가능
CREATE POLICY customers_update ON customers
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('ADMIN', 'MANAGER', 'RECEPTION'));


-- ===== 6.3 repair_tickets 테이블 RLS =====

-- SELECT: 직급별 조회 범위 제한
-- ADMIN, MANAGER: 전체 조회
-- RECEPTION: 전체 조회 (접수 목록)
-- TECHNICIAN: 본인 배정건만 조회
-- EXPERT_REPAIR: 본인 배정건만 조회
-- CS: COMPLETED 상태만 조회
CREATE POLICY tickets_select ON repair_tickets
  FOR SELECT TO authenticated
  USING (
    CASE get_my_role()
      WHEN 'ADMIN'         THEN true
      WHEN 'MANAGER'       THEN true
      WHEN 'RECEPTION'     THEN true
      WHEN 'TECHNICIAN'    THEN assignee_id = auth.uid()
      WHEN 'EXPERT_REPAIR' THEN assignee_id = auth.uid()
      WHEN 'CS'            THEN status = 'COMPLETED'
      ELSE false
    END
  );

-- INSERT: ADMIN, MANAGER, RECEPTION만 접수 생성
CREATE POLICY tickets_insert ON repair_tickets
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('ADMIN', 'MANAGER', 'RECEPTION'));

-- UPDATE: 인증된 사용자 (세부 제한은 트리거에서 처리)
CREATE POLICY tickets_update ON repair_tickets
  FOR UPDATE TO authenticated
  USING (
    CASE get_my_role()
      WHEN 'ADMIN'         THEN true
      WHEN 'MANAGER'       THEN true
      WHEN 'RECEPTION'     THEN status = 'NEW'
      WHEN 'TECHNICIAN'    THEN assignee_id = auth.uid()
      WHEN 'EXPERT_REPAIR' THEN assignee_id = auth.uid()
      ELSE false
    END
  );

-- DELETE: ADMIN만 삭제 가능
CREATE POLICY tickets_delete ON repair_tickets
  FOR DELETE TO authenticated
  USING (get_my_role() = 'ADMIN');


-- ===== 6.4 device_models 테이블 RLS =====

-- 인증된 직원은 모델 정보 조회 가능
CREATE POLICY device_models_select ON device_models
  FOR SELECT TO authenticated
  USING (true);

-- ADMIN, MANAGER만 모델 정보 추가/수정/삭제 가능
CREATE POLICY device_models_insert ON device_models
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY device_models_update ON device_models
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY device_models_delete ON device_models
  FOR DELETE TO authenticated
  USING (get_my_role() = 'ADMIN');


-- ===== 6.5 inventory 테이블 RLS =====

-- 인증된 직원은 재고 조회 가능
CREATE POLICY inventory_select ON inventory
  FOR SELECT TO authenticated
  USING (true);

-- ADMIN, MANAGER만 재고 추가/수정 가능
CREATE POLICY inventory_insert ON inventory
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY inventory_update ON inventory
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('ADMIN', 'MANAGER'));

CREATE POLICY inventory_delete ON inventory
  FOR DELETE TO authenticated
  USING (get_my_role() = 'ADMIN');


-- ===== 6.6 ticket_logs 테이블 RLS =====

-- SELECT: 인증된 직원은 로그 조회 가능 (접수건 RLS로 이미 필터됨)
CREATE POLICY ticket_logs_select ON ticket_logs
  FOR SELECT TO authenticated
  USING (true);

-- INSERT: 인증된 직원은 로그 작성 가능
CREATE POLICY ticket_logs_insert ON ticket_logs
  FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());

-- UPDATE/DELETE: ADMIN만 가능
CREATE POLICY ticket_logs_update ON ticket_logs
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'ADMIN');

CREATE POLICY ticket_logs_delete ON ticket_logs
  FOR DELETE TO authenticated
  USING (get_my_role() = 'ADMIN');


-- =============================================
-- 완료! 모든 Enum, 테이블, 인덱스, 트리거, RLS가 생성되었습니다.
-- =============================================
