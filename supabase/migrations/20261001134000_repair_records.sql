-- =============================================================
-- Phase 2 (M1) — Repair record module (수리 기록)
-- Plan: docs/repair-intelligence/phases/phase-2-plan.md (APPROVED 2026-10-01)
--
-- New tables, one view, gate functions and two flag columns on global_settings.
-- No existing trigger, function or policy is changed.
-- Rollback SQL: see the plan §6 / phase-2-report.md.
-- =============================================================

-- ---------- 1. helper functions ----------
CREATE FUNCTION public.repair_set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_TABLE_NAME = 'repair_records' THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- 수리 기록 수정 가능 여부 (승인 완료/취소 후에는 ADMIN만)
CREATE FUNCTION public.repair_record_can_edit(p_ticket_id uuid) RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role     employee_role := get_my_role();
  v_status   ticket_status;
  v_approved boolean;
  v_assignee uuid;
BEGIN
  IF v_role IS NULL THEN
    RETURN false;
  END IF;
  SELECT status, is_approved, assignee_id INTO v_status, v_approved, v_assignee
    FROM repair_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_role = 'ADMIN' THEN
    RETURN true;
  END IF;
  IF v_approved OR v_status = 'CANCELED' THEN
    RETURN false;
  END IF;
  IF v_role = 'MANAGER' THEN
    RETURN true;
  END IF;
  RETURN v_role IN ('TECHNICIAN', 'EXPERT_REPAIR') AND v_assignee = auth.uid();
END;
$$;
COMMENT ON FUNCTION public.repair_record_can_edit(uuid) IS '수리 기록 수정 권한: ADMIN 항상, MANAGER·배정 기사는 승인/취소 전까지';

-- ---------- 2. tables ----------
CREATE TABLE public.symptom_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  uuid REFERENCES public.symptom_codes(id) ON DELETE RESTRICT,
  code       text NOT NULL CHECK (code ~ '^[A-Z0-9_.]{1,60}$'),
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 50),
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT symptom_codes_code_key UNIQUE (code),
  CONSTRAINT symptom_codes_parent_name_key UNIQUE NULLS NOT DISTINCT (parent_id, name)
);
COMMENT ON TABLE public.symptom_codes IS '증상 코드 (계층형, 관리자 편집)';

CREATE TABLE public.ticket_symptoms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL REFERENCES public.repair_tickets(id) ON DELETE RESTRICT,
  symptom_code_id uuid REFERENCES public.symptom_codes(id) ON DELETE RESTRICT,
  note            text,
  created_by      uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_symptoms_code_or_note CHECK (symptom_code_id IS NOT NULL OR NULLIF(btrim(note), '') IS NOT NULL),
  CONSTRAINT ticket_symptoms_ticket_code_key UNIQUE (ticket_id, symptom_code_id)
);
COMMENT ON TABLE public.ticket_symptoms IS '접수건별 증상 (코드 + 자유 입력)';
CREATE INDEX ticket_symptoms_code_idx ON public.ticket_symptoms (symptom_code_id);
CREATE INDEX ticket_symptoms_created_by_idx ON public.ticket_symptoms (created_by);

CREATE TABLE public.repair_records (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id               uuid NOT NULL REFERENCES public.repair_tickets(id) ON DELETE RESTRICT,
  diagnosis_summary       text,
  fault_category          text CHECK (fault_category IN ('MAINBOARD', 'DISPLAY', 'BATTERY', 'POWER', 'STORAGE', 'MEMORY',
                                                         'INPUT', 'COOLING', 'EXTERIOR', 'SOFTWARE', 'LIQUID', 'OTHER', 'NONE')),
  result                  text CHECK (result IN ('COMPLETED', 'PARTIAL', 'UNREPAIRABLE', 'CUSTOMER_ABANDONED', 'SIMPLE_CANCEL')),
  notes                   text,
  removed_parts_confirmed boolean NOT NULL DEFAULT false,
  created_by              uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by              uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repair_records_ticket_key UNIQUE (ticket_id)
);
COMMENT ON TABLE public.repair_records IS '수리 기록 (접수건당 1개): 진단 요약, 고장 분류, 결과';
COMMENT ON COLUMN public.repair_records.result IS 'COMPLETED 완료 / PARTIAL 부분수리 / UNREPAIRABLE 수리불가 / CUSTOMER_ABANDONED 고객포기 / SIMPLE_CANCEL 단순취소';
COMMENT ON COLUMN public.repair_records.removed_parts_confirmed IS '적출 부품을 모두 기재했거나 없음을 확인';
CREATE INDEX repair_records_created_by_idx ON public.repair_records (created_by);
CREATE INDEX repair_records_updated_by_idx ON public.repair_records (updated_by);
CREATE TRIGGER trg_repair_records_updated_at BEFORE UPDATE ON public.repair_records
  FOR EACH ROW EXECUTE FUNCTION public.repair_set_updated_at();

CREATE TABLE public.repair_measurements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid NOT NULL REFERENCES public.repair_tickets(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  label      text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 100),
  kind       text NOT NULL DEFAULT 'OTHER' CHECK (kind IN ('VOLTAGE', 'RESISTANCE', 'DIODE', 'CURRENT', 'OTHER')),
  value      numeric,
  unit       text CHECK (unit IS NULL OR char_length(unit) <= 20),
  value_text text,
  judgement  text NOT NULL DEFAULT 'UNKNOWN' CHECK (judgement IN ('NORMAL', 'ABNORMAL', 'UNKNOWN')),
  note       text,
  created_by uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT repair_measurements_has_value CHECK (value IS NOT NULL OR NULLIF(btrim(value_text), '') IS NOT NULL)
);
COMMENT ON TABLE public.repair_measurements IS '수리 중 측정값';
CREATE INDEX repair_measurements_ticket_idx ON public.repair_measurements (ticket_id);
CREATE INDEX repair_measurements_created_by_idx ON public.repair_measurements (created_by);

CREATE TABLE public.repair_faults (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES public.repair_tickets(id) ON DELETE RESTRICT,
  sort_order  integer NOT NULL DEFAULT 0,
  component   text NOT NULL CHECK (char_length(btrim(component)) BETWEEN 1 AND 100),
  fault_type  text NOT NULL DEFAULT 'OTHER' CHECK (fault_type IN ('SHORT', 'OPEN', 'LEAKAGE', 'NO_OUTPUT', 'CORROSION', 'PHYSICAL', 'FIRMWARE', 'OTHER')),
  description text,
  created_by  uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.repair_faults IS '확인된 고장 부위';
CREATE INDEX repair_faults_ticket_idx ON public.repair_faults (ticket_id);
CREATE INDEX repair_faults_created_by_idx ON public.repair_faults (created_by);

CREATE TABLE public.repair_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES public.repair_tickets(id) ON DELETE RESTRICT,
  sort_order   integer NOT NULL DEFAULT 0,
  action_type  text NOT NULL DEFAULT 'OTHER' CHECK (action_type IN ('REPLACE', 'REWORK', 'CLEAN', 'FIRMWARE', 'ADJUST', 'OTHER')),
  description  text NOT NULL CHECK (char_length(btrim(description)) >= 1),
  succeeded    boolean,
  fault_id     uuid REFERENCES public.repair_faults(id) ON DELETE SET NULL,
  performed_by uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.repair_actions IS '수리 조치 내역 (순서대로, 실패한 시도도 보존)';
COMMENT ON COLUMN public.repair_actions.succeeded IS 'true 성공 / false 실패 / NULL 미확정';
CREATE INDEX repair_actions_ticket_idx ON public.repair_actions (ticket_id);
CREATE INDEX repair_actions_fault_idx ON public.repair_actions (fault_id);
CREATE INDEX repair_actions_performed_by_idx ON public.repair_actions (performed_by);

CREATE TABLE public.ticket_removed_parts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           uuid NOT NULL REFERENCES public.repair_tickets(id) ON DELETE RESTRICT,
  description         text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 200),
  category_id         uuid REFERENCES public.inventory_categories(id),
  disposition         text CHECK (disposition IN ('DISCARD', 'CUSTOMER_RETURN', 'STOCK', 'DONOR_KEEP')),
  return_spec         text,
  return_name         text,
  return_capacity     text CHECK (return_capacity IS NULL OR char_length(return_capacity) <= 50),
  return_condition    text CHECK (return_condition IS NULL OR return_condition IN ('중고품', '불량품')),
  quantity            integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  handled_by          uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  handled_at          timestamptz,
  inbound_approved_at timestamptz,
  inbound_approved_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  inventory_item_id   uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  created_by          uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_removed_parts_stock_fields CHECK (
    disposition IS DISTINCT FROM 'STOCK'
    OR (category_id IS NOT NULL AND NULLIF(btrim(return_spec), '') IS NOT NULL
        AND NULLIF(btrim(return_name), '') IS NOT NULL AND return_condition IS NOT NULL)),
  CONSTRAINT ticket_removed_parts_inbound_needs_stock CHECK (inbound_approved_at IS NULL OR disposition = 'STOCK')
);
COMMENT ON TABLE public.ticket_removed_parts IS '적출 부품 (자재 출고 행 없이 떼어낸 부품 포함)과 처리 방법';
COMMENT ON COLUMN public.ticket_removed_parts.disposition IS 'DISCARD 폐기 / CUSTOMER_RETURN 고객반환 / STOCK 재고등록 / DONOR_KEEP Donor유지 / NULL 미정';
COMMENT ON COLUMN public.ticket_removed_parts.inbound_approved_at IS '재고 입고 승인 시각 (RPC 전용)';
CREATE INDEX ticket_removed_parts_ticket_idx ON public.ticket_removed_parts (ticket_id);
CREATE INDEX ticket_removed_parts_category_idx ON public.ticket_removed_parts (category_id);
CREATE INDEX ticket_removed_parts_handled_by_idx ON public.ticket_removed_parts (handled_by);
CREATE INDEX ticket_removed_parts_inbound_by_idx ON public.ticket_removed_parts (inbound_approved_by);
CREATE INDEX ticket_removed_parts_item_idx ON public.ticket_removed_parts (inventory_item_id);
CREATE INDEX ticket_removed_parts_created_by_idx ON public.ticket_removed_parts (created_by);
CREATE TRIGGER trg_ticket_removed_parts_updated_at BEFORE UPDATE ON public.ticket_removed_parts
  FOR EACH ROW EXECUTE FUNCTION public.repair_set_updated_at();

-- 처리 방법이 바뀌면 처리자/처리 시각을 기록
CREATE FUNCTION public.repair_removed_part_stamp() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.disposition IS DISTINCT FROM OLD.disposition THEN
    IF NEW.disposition IS NULL THEN
      NEW.handled_by := NULL;
      NEW.handled_at := NULL;
    ELSE
      NEW.handled_by := auth.uid();
      NEW.handled_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_ticket_removed_parts_stamp BEFORE INSERT OR UPDATE ON public.ticket_removed_parts
  FOR EACH ROW EXECUTE FUNCTION public.repair_removed_part_stamp();

CREATE TABLE public.ticket_close_overrides (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid NOT NULL REFERENCES public.repair_tickets(id) ON DELETE RESTRICT,
  gate          text NOT NULL CHECK (gate IN ('APPROVAL', 'CANCEL')),
  reason        text NOT NULL CHECK (char_length(btrim(reason)) >= 1),
  missing       jsonb NOT NULL,
  overridden_by uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.ticket_close_overrides IS '수리 기록 필수 확인(게이트) 강제 통과 이력';
CREATE INDEX ticket_close_overrides_ticket_idx ON public.ticket_close_overrides (ticket_id);
CREATE INDEX ticket_close_overrides_by_idx ON public.ticket_close_overrides (overridden_by);

-- ---------- 3. flags (Q4) ----------
ALTER TABLE public.global_settings
  ADD COLUMN ri_approval_gate_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN ri_cancel_gate_enabled   boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.global_settings.ri_approval_gate_enabled IS '최종 승인 시 수리 기록 필수 확인 (기본 OFF)';
COMMENT ON COLUMN public.global_settings.ri_cancel_gate_enabled IS '접수 취소 시 취소 구분·적출 부품 필수 확인 (기본 OFF)';

-- ---------- 4. view: parts used (no re-entry, P6) ----------
CREATE VIEW public.repair_parts_used WITH (security_invoker = true) AS
  SELECT m.ticket_id,
         m.id AS material_id,
         m.request_type,
         m.quantity,
         c.name AS category_name,
         s.name AS spec_name,
         p.name AS product_name,
         i.capacity,
         i.condition,
         (s.name = '외주') AS is_outsourced
    FROM public.ticket_materials m
    JOIN public.inventory_items i ON i.id = m.inventory_item_id
    JOIN public.inventory_categories c ON c.id = i.category_id
    JOIN public.inventory_specs s ON s.id = i.spec_id
    JOIN public.inventory_products p ON p.id = i.product_id
   WHERE m.request_status IN ('approved', 'cancel_requested');
COMMENT ON VIEW public.repair_parts_used IS '수리에 사용된 부품 (승인된 출고/구매 자재) — 수리 기록 화면 읽기 전용';
REVOKE ALL ON public.repair_parts_used FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.repair_parts_used FROM authenticated;

-- ---------- 5. RLS ----------
ALTER TABLE public.symptom_codes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_symptoms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_measurements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_faults          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_actions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_removed_parts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_close_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY symptom_codes_select ON public.symptom_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY symptom_codes_insert ON public.symptom_codes FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'ADMIN'::public.employee_role);
CREATE POLICY symptom_codes_update ON public.symptom_codes FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'ADMIN'::public.employee_role)
  WITH CHECK (public.get_my_role() = 'ADMIN'::public.employee_role);
CREATE POLICY symptom_codes_delete ON public.symptom_codes FOR DELETE TO authenticated
  USING (public.get_my_role() = 'ADMIN'::public.employee_role);
REVOKE ALL ON public.symptom_codes FROM anon;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ticket_symptoms', 'repair_records', 'repair_measurements', 'repair_faults', 'repair_actions'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.repair_record_can_edit(ticket_id))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.repair_record_can_edit(ticket_id)) WITH CHECK (public.repair_record_can_edit(ticket_id))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.repair_record_can_edit(ticket_id))', t || '_delete', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END;
$$;

-- 적출 부품: 입고 승인된 행은 누구도 수정/삭제 불가, RPC 전용 컬럼은 직접 쓸 수 없음
CREATE POLICY ticket_removed_parts_select ON public.ticket_removed_parts FOR SELECT TO authenticated USING (true);
CREATE POLICY ticket_removed_parts_insert ON public.ticket_removed_parts FOR INSERT TO authenticated
  WITH CHECK (public.repair_record_can_edit(ticket_id) AND inbound_approved_at IS NULL);
CREATE POLICY ticket_removed_parts_update ON public.ticket_removed_parts FOR UPDATE TO authenticated
  USING (public.repair_record_can_edit(ticket_id) AND inbound_approved_at IS NULL)
  WITH CHECK (public.repair_record_can_edit(ticket_id) AND inbound_approved_at IS NULL);
CREATE POLICY ticket_removed_parts_delete ON public.ticket_removed_parts FOR DELETE TO authenticated
  USING (public.repair_record_can_edit(ticket_id) AND inbound_approved_at IS NULL);
REVOKE ALL ON public.ticket_removed_parts FROM anon;
REVOKE INSERT, UPDATE, TRUNCATE ON public.ticket_removed_parts FROM authenticated;
GRANT INSERT (ticket_id, description, category_id, disposition, return_spec, return_name, return_capacity, return_condition, quantity)
  ON public.ticket_removed_parts TO authenticated;
GRANT UPDATE (description, category_id, disposition, return_spec, return_name, return_capacity, return_condition, quantity)
  ON public.ticket_removed_parts TO authenticated;

CREATE POLICY ticket_close_overrides_select ON public.ticket_close_overrides FOR SELECT TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role]));
REVOKE ALL ON public.ticket_close_overrides FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ticket_close_overrides FROM authenticated;

-- ---------- 6. gate functions ----------

-- 6.1 필수 항목 확인 (호출자 권한, RLS 적용)
CREATE FUNCTION public.repair_gate_check(p_ticket_id uuid, p_gate text) RETURNS jsonb
  LANGUAGE plpgsql STABLE
  SET search_path = public
AS $$
DECLARE
  v_received  timestamptz;
  v_rec       repair_records;
  v_missing   text[] := '{}';
  v_undecided integer;
BEGIN
  IF p_gate IS NULL OR p_gate NOT IN ('APPROVAL', 'CANCEL') THEN
    RAISE EXCEPTION '알 수 없는 확인 유형입니다.';
  END IF;

  SELECT received_at INTO v_received FROM repair_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '접수건을 찾을 수 없습니다.';
  END IF;

  SELECT * INTO v_rec FROM repair_records WHERE ticket_id = p_ticket_id;
  SELECT count(*) INTO v_undecided FROM ticket_removed_parts WHERE ticket_id = p_ticket_id AND disposition IS NULL;

  IF p_gate = 'APPROVAL' THEN
    IF NULLIF(btrim(v_rec.diagnosis_summary), '') IS NULL THEN
      v_missing := v_missing || '진단 요약'::text;
    END IF;
    IF v_rec.result IS NULL OR v_rec.result NOT IN ('COMPLETED', 'PARTIAL') THEN
      v_missing := v_missing || '수리 결과(완료/부분수리)'::text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ticket_symptoms WHERE ticket_id = p_ticket_id) THEN
      v_missing := v_missing || '증상'::text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM repair_actions WHERE ticket_id = p_ticket_id) THEN
      v_missing := v_missing || '조치 내역'::text;
    END IF;
  ELSE
    IF v_rec.result IS NULL OR v_rec.result NOT IN ('UNREPAIRABLE', 'CUSTOMER_ABANDONED', 'SIMPLE_CANCEL') THEN
      v_missing := v_missing || '취소 구분(수리불가/고객포기/단순취소)'::text;
    END IF;
  END IF;

  -- 적출 부품: 승인 시 항상, 취소 시에는 입고된 기기만
  IF p_gate = 'APPROVAL' OR v_received IS NOT NULL THEN
    IF NOT coalesce(v_rec.removed_parts_confirmed, false) THEN
      v_missing := v_missing || '적출 부품 확인'::text;
    END IF;
    IF v_undecided > 0 THEN
      v_missing := v_missing || ('처리 방법 미정인 적출 부품 ' || v_undecided || '건');
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', cardinality(v_missing) = 0, 'missing', to_jsonb(v_missing));
END;
$$;
COMMENT ON FUNCTION public.repair_gate_check(uuid, text) IS '승인/취소 전 수리 기록 필수 항목 확인. {ok, missing[]}';

-- 6.2 취소 구분 저장 (취소할 수 있는 사람은 누구나 — 접수처는 수리 기록 수정 권한이 없으므로 별도 함수)
CREATE FUNCTION public.repair_set_cancel_result(p_ticket_id uuid, p_result text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role     employee_role := get_my_role();
  v_status   ticket_status;
  v_assignee uuid;
BEGIN
  IF p_result IS NULL OR p_result NOT IN ('UNREPAIRABLE', 'CUSTOMER_ABANDONED', 'SIMPLE_CANCEL') THEN
    RAISE EXCEPTION '취소 구분을 선택해 주세요.';
  END IF;

  SELECT status, assignee_id INTO v_status, v_assignee FROM repair_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '접수건을 찾을 수 없습니다.';
  END IF;
  IF v_status IN ('COMPLETED', 'CANCELED') THEN
    RAISE EXCEPTION '완료되었거나 이미 취소된 접수건입니다.';
  END IF;

  IF NOT (coalesce(v_role IN ('ADMIN', 'MANAGER'), false)
          OR (v_role = 'RECEPTION' AND v_status = 'NEW')
          OR (v_role IN ('TECHNICIAN', 'EXPERT_REPAIR') AND v_assignee = auth.uid())) THEN
    RAISE EXCEPTION '취소 구분을 저장할 권한이 없습니다.';
  END IF;

  INSERT INTO repair_records (ticket_id, result, created_by)
  VALUES (p_ticket_id, p_result, auth.uid())
  ON CONFLICT (ticket_id) DO UPDATE SET result = EXCLUDED.result;
END;
$$;
COMMENT ON FUNCTION public.repair_set_cancel_result(uuid, text) IS '접수 취소 시 취소 구분(수리불가/고객포기/단순취소)을 수리 기록에 저장';

-- 6.3 관리자 강제 통과 (사유 필수, 이력 기록)
CREATE FUNCTION public.repair_gate_override(p_ticket_id uuid, p_gate text, p_reason text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_check jsonb;
  v_id    uuid;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '강제 진행은 관리자만 할 수 있습니다.';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION '강제 진행 사유를 입력해 주세요.';
  END IF;

  v_check := repair_gate_check(p_ticket_id, p_gate);
  IF (v_check->>'ok')::boolean THEN
    RETURN NULL;  -- 미충족 항목 없음 → 기록할 것이 없다
  END IF;

  INSERT INTO ticket_close_overrides (ticket_id, gate, reason, missing, overridden_by)
  VALUES (p_ticket_id, p_gate, btrim(p_reason), v_check->'missing', auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
COMMENT ON FUNCTION public.repair_gate_override(uuid, text, text) IS '수리 기록 미완료 상태로 승인/취소 강제 진행 (ADMIN, 사유 기록)';

-- ---------- 7. function privileges ----------
REVOKE ALL ON FUNCTION public.repair_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.repair_removed_part_stamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.repair_record_can_edit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.repair_gate_check(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.repair_set_cancel_result(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.repair_gate_override(uuid, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.repair_record_can_edit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_gate_check(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_set_cancel_result(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_gate_override(uuid, text, text) TO authenticated;

-- ---------- 8. reference data: top-level symptom codes ----------
INSERT INTO public.symptom_codes (code, name, sort_order) VALUES
  ('POWER', '전원', 10), ('CHARGING', '충전', 20), ('DISPLAY', '디스플레이', 30), ('BOOT', '부팅', 40),
  ('THERMAL', '발열', 50), ('INPUT', '입력장치', 60), ('EXTERIOR', '외관', 70), ('DATA', '데이터', 80), ('OTHER', '기타', 90);
