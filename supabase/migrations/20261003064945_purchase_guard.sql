-- =============================================================
-- Phase 6 — Purchase guard (구매 요청 전 내부 자원 확인)
-- Plan: docs/repair-intelligence/phases/phase-6-plan.md (APPROVED 2026-10-03)
-- Additive only. The one addition to an existing table is a NEW trigger on ticket_materials (§3.4, decision 4).
-- Rollback: supabase/test-fixtures/phase6/rollback.sql
-- =============================================================

-- ---------- 1. flag (Q4, P10: default OFF) ----------
ALTER TABLE public.global_settings
  ADD COLUMN ri_purchase_guard_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.global_settings.ri_purchase_guard_enabled IS '구매 요청 시 내부 자원 확인 (기본 OFF)';

-- ---------- 2. table: purchase reason log ----------
CREATE TABLE public.purchase_guard_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      uuid NOT NULL REFERENCES public.repair_tickets(id) ON DELETE RESTRICT,
  material_id    uuid NOT NULL REFERENCES public.ticket_materials(id) ON DELETE RESTRICT,
  item_label     text NOT NULL,
  quantity       integer NOT NULL CHECK (quantity > 0),
  resource_count integer NOT NULL CHECK (resource_count >= 0),
  resources      jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason_code    text CHECK (reason_code IS NULL OR reason_code IN
                   ('INTERNAL_DEFECTIVE', 'CUSTOMER_NEW', 'DONOR_UNVERIFIED', 'LEAD_TIME', 'OTHER')),
  reason_note    text CHECK (reason_note IS NULL OR char_length(reason_note) <= 500),
  requested_by   uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_guard_logs_material_key UNIQUE (material_id),
  CONSTRAINT purchase_guard_logs_reason_required CHECK (resource_count = 0 OR reason_code IS NOT NULL),
  CONSTRAINT purchase_guard_logs_other_note CHECK (
    reason_code IS DISTINCT FROM 'OTHER' OR char_length(btrim(coalesce(reason_note, ''))) >= 2)
);
COMMENT ON TABLE public.purchase_guard_logs IS '구매 요청 시 확인된 내부 자원과 구매 사유 (RPC 전용 기록, 고객 정보·가격 없음)';
COMMENT ON COLUMN public.purchase_guard_logs.resources IS '요청 시점에 표시된 내부 자원 스냅샷 (재고·Donor)';
COMMENT ON COLUMN public.purchase_guard_logs.reason_code IS
  'INTERNAL_DEFECTIVE 내부재고 불량 / CUSTOMER_NEW 고객 신품요청 / DONOR_UNVERIFIED Donor 상태 미확인 / LEAD_TIME 납기 / OTHER 기타';
CREATE INDEX purchase_guard_logs_ticket_idx       ON public.purchase_guard_logs (ticket_id);
CREATE INDEX purchase_guard_logs_requested_by_idx ON public.purchase_guard_logs (requested_by);
CREATE INDEX purchase_guard_logs_created_at_idx   ON public.purchase_guard_logs (created_at);
CREATE INDEX purchase_guard_logs_reason_idx       ON public.purchase_guard_logs (reason_code);

ALTER TABLE public.purchase_guard_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_guard_logs_select ON public.purchase_guard_logs FOR SELECT TO authenticated
  USING (public.get_my_role() = 'ADMIN'::public.employee_role);
REVOKE ALL ON public.purchase_guard_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.purchase_guard_logs FROM authenticated;

-- ---------- 3. functions ----------

-- 3.1 내부 자원 목록 (내부용, API 권한 없음). 외주·테스트 Donor 제외, 가격·고객 정보 없음.
CREATE FUNCTION public.ri_purchase_resources(p_material_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE
  SET search_path = public
AS $$
DECLARE
  v_item      record;
  v_ticket    record;
  v_part_type text;
  v_compat    uuid[] := '{}';
  v_seen      uuid[] := '{}';
  v_res       jsonb := '[]'::jsonb;
  r           record;
BEGIN
  SELECT i.id, i.product_id, i.category_id, i.capacity, i.condition, i.quantity, i.part_spec_id, m.ticket_id
    INTO v_item
    FROM ticket_materials m JOIN inventory_items i ON i.id = m.inventory_item_id
   WHERE m.id = p_material_id;
  IF NOT FOUND THEN
    RETURN v_res;
  END IF;
  SELECT t.catalog_model_id, t.catalog_variant_id, t.catalog_board_id INTO v_ticket
    FROM repair_tickets t WHERE t.id = v_item.ticket_id;

  IF v_item.part_spec_id IS NOT NULL THEN
    SELECT ps.part_type INTO v_part_type FROM part_specs ps WHERE ps.id = v_item.part_spec_id;
    IF v_ticket.catalog_model_id IS NOT NULL OR v_ticket.catalog_board_id IS NOT NULL THEN
      SELECT coalesce(array_agg(DISTINCT s.part_spec_id), '{}') INTO v_compat
        FROM search_parts_for_device(v_ticket.catalog_model_id, v_ticket.catalog_variant_id, v_ticket.catalog_board_id) s
       WHERE s.rank IN (1, 2) AND s.part_type = v_part_type AND s.part_spec_id <> v_item.part_spec_id;
    END IF;
  END IF;

  -- 1-4: 재고 (외주 제외, 수량 > 0). 규칙 순서대로, 같은 행은 한 번만
  FOR r IN
    WITH cand AS (
      SELECT 1 AS rule, 'STOCK_SAME_ITEM'::text AS source, i.id FROM inventory_items i WHERE i.id = v_item.id
      UNION ALL
      SELECT 2, 'STOCK_SAME_PRODUCT', i.id FROM inventory_items i
       WHERE i.product_id = v_item.product_id AND i.id <> v_item.id
         AND lower(btrim(coalesce(i.capacity, ''))) = lower(btrim(coalesce(v_item.capacity, '')))
      UNION ALL
      SELECT 3, 'STOCK_SAME_SPEC', i.id FROM inventory_items i
       WHERE v_item.part_spec_id IS NOT NULL AND i.part_spec_id = v_item.part_spec_id
      UNION ALL
      SELECT 4, 'STOCK_COMPATIBLE', i.id FROM inventory_items i WHERE i.part_spec_id = ANY (v_compat)
    )
    SELECT DISTINCT ON (c.id) c.rule, c.source, i.id, i.quantity, i.condition,
           concat_ws(' / ', ic.name, s.name, p.name, nullif(btrim(i.capacity), '')) AS label, ps.name AS part_name
      FROM cand c
      JOIN inventory_items i ON i.id = c.id
      JOIN inventory_specs s ON s.id = i.spec_id
      JOIN inventory_categories ic ON ic.id = i.category_id
      JOIN inventory_products p ON p.id = i.product_id
      LEFT JOIN part_specs ps ON ps.id = i.part_spec_id
     WHERE i.quantity > 0 AND s.name <> '외주'
     ORDER BY c.id, c.rule
  LOOP
    v_seen := v_seen || r.id;
    v_res := v_res || jsonb_build_object('rule', r.rule, 'source', r.source, 'ref_id', r.id, 'label', r.label,
                                         'part_name', r.part_name, 'qty', r.quantity, 'condition', r.condition::text,
                                         'note', NULL);
  END LOOP;

  -- 5-6: Donor 후보 (보관 중 Donor, 불량 판정 제외, 테스트 접수에서 온 Donor 제외)
  FOR r IN
    WITH cand AS (
      SELECT 5 AS rule, 'DONOR_SAME_SPEC'::text AS source, c.id
        FROM donor_part_candidates c
       WHERE c.part_spec_id IS NOT NULL
         AND (c.part_spec_id = v_item.part_spec_id OR c.part_spec_id = ANY (v_compat))
      UNION ALL
      SELECT 6, 'DONOR_SAME_DEVICE', c.id
        FROM donor_part_candidates c JOIN donor_devices d ON d.id = c.donor_id
       WHERE c.category_id = v_item.category_id
         AND ((v_ticket.catalog_model_id IS NOT NULL AND d.catalog_model_id = v_ticket.catalog_model_id)
           OR (v_ticket.catalog_board_id IS NOT NULL AND d.catalog_board_id = v_ticket.catalog_board_id))
    )
    SELECT DISTINCT ON (c.id) c.rule, c.source, dc.id, dc.quantity, dc.condition_estimate, dc.description,
           ps.name AS part_name, d.id AS donor_id, d.donor_no, d.storage_note
      FROM cand c
      JOIN donor_part_candidates dc ON dc.id = c.id
      JOIN donor_devices d ON d.id = dc.donor_id
      JOIN repair_tickets st ON st.id = d.source_ticket_id
      LEFT JOIN part_specs ps ON ps.id = dc.part_spec_id
     WHERE d.status = 'AVAILABLE'
       AND dc.condition_estimate <> 'FAULTY'
       AND ((c.rule = 5 AND dc.status IN ('AVAILABLE', 'REQUESTED')) OR (c.rule = 6 AND dc.status = 'AVAILABLE'))
       AND st.is_test IS NOT TRUE
     ORDER BY c.id, c.rule
  LOOP
    v_res := v_res || jsonb_build_object('rule', r.rule, 'source', r.source, 'ref_id', r.id, 'label', r.description,
                                         'part_name', r.part_name, 'qty', r.quantity, 'condition', r.condition_estimate,
                                         'donor_id', r.donor_id, 'note', concat_ws(' · ', r.donor_no, nullif(btrim(r.storage_note), '')));
  END LOOP;

  RETURN (SELECT coalesce(jsonb_agg(e ORDER BY (e->>'rule')::int, e->>'label'), '[]'::jsonb)
            FROM jsonb_array_elements(v_res) e);
END;
$$;
COMMENT ON FUNCTION public.ri_purchase_resources(uuid) IS
  '구매 요청 자재의 내부 대체 자원 (재고 규칙 1-4, Donor 규칙 5-6). 내부용 — API 권한 없음';

-- 3.2 공통: 구매 요청 대상 확인 + 호출자 권한 (내부용)
CREATE FUNCTION public.ri_purchase_material_info(p_material_id uuid, p_lock boolean DEFAULT false)
RETURNS TABLE (material_id uuid, ticket_id uuid, request_type text, request_status text, quantity integer,
               item_label text, outsourced boolean)
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  v_role     employee_role := get_my_role();
  v_assignee uuid;
BEGIN
  IF p_lock THEN
    PERFORM 1 FROM ticket_materials m WHERE m.id = p_material_id FOR UPDATE;
  END IF;
  RETURN QUERY
    SELECT m.id, m.ticket_id, m.request_type, m.request_status::text, m.quantity,
           concat_ws(' / ', ic.name, s.name, p.name, nullif(btrim(i.capacity), ''))
             || CASE i.condition WHEN 'NEW' THEN ' (신품)' ELSE ' (중고)' END,
           s.name = '외주'
      FROM ticket_materials m
      JOIN inventory_items i ON i.id = m.inventory_item_id
      JOIN inventory_specs s ON s.id = i.spec_id
      JOIN inventory_categories ic ON ic.id = i.category_id
      JOIN inventory_products p ON p.id = i.product_id
     WHERE m.id = p_material_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '자재 항목을 찾을 수 없습니다.';
  END IF;

  SELECT t.assignee_id INTO v_assignee
    FROM ticket_materials m JOIN repair_tickets t ON t.id = m.ticket_id WHERE m.id = p_material_id;
  IF NOT (v_role IN ('ADMIN', 'MANAGER')
          OR (v_role IN ('TECHNICIAN', 'EXPERT_REPAIR') AND v_assignee IS NOT DISTINCT FROM auth.uid())) THEN
    RAISE EXCEPTION '구매 요청 권한이 없습니다.';
  END IF;
END;
$$;
COMMENT ON FUNCTION public.ri_purchase_material_info(uuid, boolean) IS '구매 가드 공통: 자재 정보 + 호출자 권한 확인. 내부용';

-- 3.3 확인 창용 (읽기 전용)
CREATE FUNCTION public.purchase_guard_check(p_material_id uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_info      record;
  v_enabled   boolean;
  v_resources jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_info FROM ri_purchase_material_info(p_material_id);
  IF v_info.request_type IS DISTINCT FROM 'purchase' THEN
    RAISE EXCEPTION '구매 요청 항목이 아닙니다.';
  END IF;
  SELECT gs.ri_purchase_guard_enabled INTO v_enabled FROM global_settings gs WHERE gs.id;
  IF NOT v_info.outsourced THEN
    v_resources := ri_purchase_resources(p_material_id);
  END IF;
  RETURN jsonb_build_object(
    'enabled', coalesce(v_enabled, false),
    'excluded', v_info.outsourced,
    'item_label', v_info.item_label,
    'quantity', v_info.quantity,
    'request_status', v_info.request_status,
    'resources', v_resources,
    'resource_count', jsonb_array_length(v_resources));
END;
$$;
COMMENT ON FUNCTION public.purchase_guard_check(uuid) IS '구매 요청 전 내부 자원 확인 (읽기 전용, 가격·고객 정보 없음)';

-- 3.4 구매 요청 (한 트랜잭션: 자원 재계산 → 사유 확인 → 기록 → requested)
CREATE FUNCTION public.request_purchase_material(p_material_id uuid, p_reason_code text DEFAULT NULL,
                                                 p_reason_note text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_info      record;
  v_enabled   boolean;
  v_resources jsonb;
  v_count     integer;
  v_code      text := nullif(btrim(p_reason_code), '');
  v_note      text := nullif(btrim(p_reason_note), '');
  v_log_id    uuid;
BEGIN
  SELECT * INTO v_info FROM ri_purchase_material_info(p_material_id, true);
  IF v_info.request_type IS DISTINCT FROM 'purchase' THEN
    RAISE EXCEPTION '구매 요청 항목이 아닙니다.';
  END IF;
  SELECT gs.ri_purchase_guard_enabled INTO v_enabled FROM global_settings gs WHERE gs.id;
  IF NOT coalesce(v_enabled, false) THEN
    RAISE EXCEPTION '구매 요청 확인 기능이 꺼져 있습니다.';
  END IF;
  IF v_info.request_status <> 'pending' THEN
    RAISE EXCEPTION '이미 출고 요청 중이거나 승인된 항목입니다.';
  END IF;

  IF v_info.outsourced THEN
    -- 외주 품목은 가드 제외 (Q5): 기록 없이 요청만
    PERFORM set_config('app.purchase_guard', 'on', true);
    UPDATE ticket_materials SET request_status = 'requested' WHERE id = p_material_id;
    PERFORM set_config('app.purchase_guard', '', true);
    RETURN jsonb_build_object('log_id', NULL, 'excluded', true, 'resource_count', 0, 'reason_code', NULL);
  END IF;

  IF v_code IS NOT NULL AND v_code NOT IN ('INTERNAL_DEFECTIVE', 'CUSTOMER_NEW', 'DONOR_UNVERIFIED', 'LEAD_TIME', 'OTHER') THEN
    RAISE EXCEPTION '알 수 없는 구매 사유입니다.';
  END IF;
  v_resources := ri_purchase_resources(p_material_id);
  v_count := jsonb_array_length(v_resources);
  IF v_count > 0 AND v_code IS NULL THEN
    RAISE EXCEPTION '내부 자원이 있습니다. 구매 사유를 선택해 주세요.';
  END IF;
  IF v_code = 'OTHER' AND char_length(coalesce(v_note, '')) < 2 THEN
    RAISE EXCEPTION '기타 사유를 입력해 주세요.';
  END IF;
  IF char_length(coalesce(v_note, '')) > 500 THEN
    RAISE EXCEPTION '사유는 500자 이내로 입력해 주세요.';
  END IF;

  INSERT INTO purchase_guard_logs (ticket_id, material_id, item_label, quantity, resource_count, resources,
                                   reason_code, reason_note, requested_by)
  VALUES (v_info.ticket_id, p_material_id, v_info.item_label, v_info.quantity, v_count, v_resources,
          v_code, v_note, auth.uid())
  RETURNING id INTO v_log_id;

  PERFORM set_config('app.purchase_guard', 'on', true);
  UPDATE ticket_materials SET request_status = 'requested' WHERE id = p_material_id;
  PERFORM set_config('app.purchase_guard', '', true);

  RETURN jsonb_build_object('log_id', v_log_id, 'excluded', false, 'resource_count', v_count, 'reason_code', v_code);
END;
$$;
COMMENT ON FUNCTION public.request_purchase_material(uuid, text, text) IS
  '구매 요청 (가드 ON): 내부 자원 재계산, 자원이 있으면 사유 필수, purchase_guard_logs 기록, pending → requested';

-- ---------- 4. bypass protection: new trigger on ticket_materials (decision 4) ----------
CREATE FUNCTION public.ri_purchase_guard_enforce() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  IF NEW.request_type = 'purchase'
     AND NEW.request_status = 'requested'
     AND (TG_OP = 'INSERT' OR NOT (OLD.request_status = 'requested' AND OLD.request_type = 'purchase'))
     AND coalesce(current_setting('app.purchase_guard', true), '') <> 'on'
     AND coalesce((SELECT gs.ri_purchase_guard_enabled FROM global_settings gs WHERE gs.id), false) THEN
    RAISE EXCEPTION '구매 요청은 내부 자원 확인 후에만 가능합니다.';
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.ri_purchase_guard_enforce() IS
  '구매 가드 ON일 때 request_purchase_material 외의 경로로 구매 요청(requested)이 되는 것을 차단';
CREATE TRIGGER trg_ticket_materials_purchase_guard
  BEFORE INSERT OR UPDATE OF request_status, request_type ON public.ticket_materials
  FOR EACH ROW EXECUTE FUNCTION public.ri_purchase_guard_enforce();

-- ---------- 5. function privileges ----------
REVOKE ALL ON FUNCTION public.ri_purchase_resources(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ri_purchase_material_info(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purchase_guard_check(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_purchase_material(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ri_purchase_guard_enforce() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.purchase_guard_check(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_purchase_material(uuid, text, text) TO authenticated;
