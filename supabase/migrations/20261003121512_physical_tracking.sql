-- =============================================================
-- Phase 7 — Physical tracking (라벨 · 보관 위치 · 스캔)
-- Plan: docs/repair-intelligence/phases/phase-7-plan.md (APPROVED 2026-10-03)
-- Additive, except the one listed change (§3.4): ri_inbound_extracted_part books extracted parts as qty-1 rows (Q8, decision 2a).
-- Existing inventory rows receive label codes during ADD COLUMN (no trigger fires, no other column changes; decision 3).
-- Rollback: supabase/test-fixtures/phase7/rollback.sql
-- =============================================================

-- ---------- 1. storage locations ----------
CREATE TABLE public.storage_locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL CHECK (code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$' AND char_length(code) <= 20),
  description text CHECK (description IS NULL OR char_length(description) <= 100),
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT storage_locations_code_key UNIQUE (code)
);
COMMENT ON TABLE public.storage_locations IS '보관 위치 (코드가 구조를 표현: A-01-04, DONOR-C07). 삭제 대신 사용 중지';
CREATE INDEX storage_locations_created_by_idx ON public.storage_locations (created_by);
CREATE TRIGGER trg_storage_locations_updated_at BEFORE UPDATE ON public.storage_locations
  FOR EACH ROW EXECUTE FUNCTION public.repair_set_updated_at();

ALTER TABLE public.storage_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY storage_locations_select ON public.storage_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY storage_locations_insert ON public.storage_locations FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = 'ADMIN'::public.employee_role);
CREATE POLICY storage_locations_update ON public.storage_locations FOR UPDATE TO authenticated
  USING (public.get_my_role() = 'ADMIN'::public.employee_role)
  WITH CHECK (public.get_my_role() = 'ADMIN'::public.employee_role);
REVOKE ALL ON public.storage_locations FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.storage_locations FROM authenticated;
GRANT INSERT (code, description) ON public.storage_locations TO authenticated;
GRANT UPDATE (description, is_active) ON public.storage_locations TO authenticated;

-- ---------- 2. item label codes ----------
CREATE SEQUENCE public.inventory_label_seq;
REVOKE ALL ON SEQUENCE public.inventory_label_seq FROM PUBLIC, anon, authenticated;

-- 재고 라벨 코드 발급 (P-00001). 시퀀스 값만 소비하므로 컬럼 기본값으로 모든 입고 경로에서 실행 가능해야 한다.
CREATE FUNCTION public.ri_next_item_label() RETURNS text
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_n bigint := nextval('public.inventory_label_seq');
BEGIN
  RETURN 'P-' || CASE WHEN v_n < 100000 THEN lpad(v_n::text, 5, '0') ELSE v_n::text END;
END;
$$;
COMMENT ON FUNCTION public.ri_next_item_label() IS '재고 라벨 코드 발급 (P-00001, 5자리 초과 시 자릿수 증가)';
REVOKE ALL ON FUNCTION public.ri_next_item_label() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ri_next_item_label() TO authenticated, service_role;

-- 휘발성 기본값으로 ADD COLUMN → 기존 행은 테이블 재작성 중에 코드를 받는다 (트리거 미실행, updated_at 불변).
ALTER TABLE public.inventory_items
  ADD COLUMN label_code text DEFAULT public.ri_next_item_label();
ALTER TABLE public.inventory_items
  ALTER COLUMN label_code SET NOT NULL,
  ADD CONSTRAINT inventory_items_label_code_key UNIQUE (label_code),
  ADD CONSTRAINT inventory_items_label_code_format CHECK (label_code ~ '^P-[0-9]{5,}$');
COMMENT ON COLUMN public.inventory_items.label_code IS '라벨 코드 (P-00001). 행 단위 라벨, 적출품은 1개 단위 행';

-- ---------- 3. location columns ----------
ALTER TABLE public.inventory_items
  ADD COLUMN storage_location_id uuid REFERENCES public.storage_locations(id) ON DELETE RESTRICT;
CREATE INDEX inventory_items_storage_location_idx ON public.inventory_items (storage_location_id);
COMMENT ON COLUMN public.inventory_items.storage_location_id IS '보관 위치 (set_storage_location으로만 변경)';

ALTER TABLE public.donor_devices
  ADD COLUMN storage_location_id uuid REFERENCES public.storage_locations(id) ON DELETE RESTRICT;
CREATE INDEX donor_devices_storage_location_idx ON public.donor_devices (storage_location_id);
COMMENT ON COLUMN public.donor_devices.storage_location_id IS '보관 위치 (set_storage_location으로만 변경). storage_note는 자유 메모로 유지';

-- ---------- 4. CHANGED: extracted parts become qty-1 rows (plan §3.4, Q8) ----------
-- 시그니처·권한·검증 메시지는 Phase 2와 동일. 합산하지 않고 수량만큼 1개 단위 중고 행 + INBOUND 1건씩 생성, 첫 행 id 반환.
CREATE OR REPLACE FUNCTION public.ri_inbound_extracted_part(
  p_category_id uuid, p_spec text, p_name text, p_capacity text, p_quantity integer,
  p_ticket_id uuid, p_tx_user_id uuid
) RETURNS uuid
  LANGUAGE plpgsql
  SET search_path = public
AS $$
DECLARE
  v_capacity   text := NULLIF(btrim(p_capacity), '');
  v_spec_id    uuid;
  v_product_id uuid;
  v_item_id    uuid;
  v_first_id   uuid;
BEGIN
  IF p_category_id IS NULL OR NULLIF(btrim(p_spec), '') IS NULL OR NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION '적출 자재의 카테고리·사양·제품명이 필요합니다.';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION '수량은 1 이상이어야 합니다.';
  END IF;
  IF char_length(v_capacity) > 50 THEN
    RAISE EXCEPTION '용량은 50자 이내로 입력해 주세요.';
  END IF;

  INSERT INTO inventory_specs (category_id, name) VALUES (p_category_id, p_spec)
    ON CONFLICT (category_id, name) DO NOTHING;
  SELECT id INTO v_spec_id FROM inventory_specs WHERE category_id = p_category_id AND name = p_spec;

  INSERT INTO inventory_products (spec_id, name) VALUES (v_spec_id, p_name)
    ON CONFLICT (spec_id, name) DO NOTHING;
  SELECT id INTO v_product_id FROM inventory_products WHERE spec_id = v_spec_id AND name = p_name;

  -- 적출품은 1개 단위 중고(USED) 행으로 입고 → 행마다 개별 라벨 (Q8). 기존 행에는 합산하지 않는다.
  FOR i IN 1..p_quantity LOOP
    INSERT INTO inventory_items (category_id, spec_id, product_id, capacity, condition, quantity, base_estimate)
    VALUES (p_category_id, v_spec_id, v_product_id, v_capacity, 'USED', 1, 0)
    RETURNING id INTO v_item_id;

    INSERT INTO inventory_transactions (item_id, user_id, transaction_type, quantity_changed, ticket_id, notes)
    VALUES (v_item_id, p_tx_user_id, 'INBOUND', 1, p_ticket_id, '적출품 반환 입고');

    v_first_id := coalesce(v_first_id, v_item_id);
  END LOOP;

  RETURN v_first_id;
END;
$$;
COMMENT ON FUNCTION public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid) IS '내부용: 적출품을 1개 단위 중고 재고 행으로 입고 (스펙/제품 조회·생성 + 행마다 INBOUND, 첫 행 id 반환). 직접 호출 불가';
-- privileges unchanged (Phase 2: no EXECUTE for PUBLIC/anon/authenticated/service_role); CREATE OR REPLACE keeps the ACL.

-- ---------- 5. label lookup (scan) ----------
-- 모든 직원: 품목/Donor 정보·위치. 입출고 이력은 ADMIN/MANAGER만 (decision 5). 가격·고객 정보 없음, 접수는 receipt_no만.
CREATE FUNCTION public.label_lookup(p_code text) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role  employee_role := get_my_role();
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_item  jsonb;
  v_id    uuid;
  v_hist  jsonb;
  v_donor jsonb;
  v_cands jsonb;
BEGIN
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('error', '인증이 필요합니다.');
  END IF;

  IF v_code LIKE 'P-%' THEN
    SELECT i.id,
           jsonb_build_object(
             'id', i.id, 'label_code', i.label_code,
             'category', c.name, 'spec', s.name, 'product', p.name,
             'capacity', i.capacity, 'condition', i.condition, 'quantity', i.quantity,
             'part_spec', ps.name, 'location', l.code, 'is_outsourced', s.name = '외주',
             'created_at', i.created_at)
      INTO v_id, v_item
      FROM inventory_items i
      JOIN inventory_categories c ON c.id = i.category_id
      JOIN inventory_specs s ON s.id = i.spec_id
      JOIN inventory_products p ON p.id = i.product_id
      LEFT JOIN part_specs ps ON ps.id = i.part_spec_id
      LEFT JOIN storage_locations l ON l.id = i.storage_location_id
     WHERE i.label_code = v_code;

    IF v_id IS NOT NULL THEN
      IF v_role IN ('ADMIN', 'MANAGER') THEN
        SELECT coalesce(jsonb_agg(h ORDER BY h_at DESC), '[]'::jsonb) INTO v_hist
          FROM (SELECT t.created_at AS h_at,
                       jsonb_build_object('created_at', t.created_at, 'type', t.transaction_type,
                                          'quantity', t.quantity_changed, 'notes', t.notes,
                                          'employee', e.name, 'receipt_no', r.receipt_no, 'ticket_id', t.ticket_id) AS h
                  FROM inventory_transactions t
                  LEFT JOIN employees e ON e.id = t.user_id
                  LEFT JOIN repair_tickets r ON r.id = t.ticket_id
                 WHERE t.item_id = v_id
                 ORDER BY t.created_at DESC
                 LIMIT 50) x;
      END IF;
      RETURN jsonb_build_object('kind', 'ITEM', 'item', v_item, 'history', v_hist);
    END IF;

  ELSIF v_code LIKE 'D-%' THEN
    SELECT d.id,
           jsonb_build_object(
             'id', d.id, 'donor_no', d.donor_no, 'status', d.status, 'device_type', d.device_type,
             'brand', d.brand, 'model_text', d.model_text,
             'catalog_model_label', CASE WHEN cm.id IS NOT NULL THEN concat_ws(' ', br.name, cm.name, cv.name) END,
             'board_number', cb.board_number, 'location', l.code, 'storage_note', d.storage_note,
             'source_receipt_no', r.receipt_no, 'source_ticket_id', d.source_ticket_id, 'created_at', d.created_at)
      INTO v_id, v_donor
      FROM donor_devices d
      JOIN repair_tickets r ON r.id = d.source_ticket_id
      LEFT JOIN catalog_models cm ON cm.id = d.catalog_model_id
      LEFT JOIN catalog_brands br ON br.id = cm.brand_id
      LEFT JOIN catalog_variants cv ON cv.id = d.catalog_variant_id
      LEFT JOIN catalog_boards cb ON cb.id = d.catalog_board_id
      LEFT JOIN storage_locations l ON l.id = d.storage_location_id
     WHERE d.donor_no = v_code;

    IF v_id IS NOT NULL THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'description', c.description, 'status', c.status, 'quantity', c.quantity,
               'condition_estimate', c.condition_estimate, 'part_spec', ps.name,
               'extracted_at', c.extracted_at, 'item_label_code', i.label_code)
             ORDER BY c.created_at), '[]'::jsonb)
        INTO v_cands
        FROM donor_part_candidates c
        LEFT JOIN part_specs ps ON ps.id = c.part_spec_id
        LEFT JOIN inventory_items i ON i.id = c.inventory_item_id
       WHERE c.donor_id = v_id;
      RETURN jsonb_build_object('kind', 'DONOR', 'donor', v_donor, 'candidates', v_cands);
    END IF;
  END IF;

  RETURN jsonb_build_object('error', '등록되지 않은 라벨입니다.');
END;
$$;
COMMENT ON FUNCTION public.label_lookup(text) IS '라벨 스캔 조회 (직원): 재고/Donor 정보와 위치. 입출고 이력은 ADMIN/MANAGER만. 가격·고객 정보 없음';

-- ---------- 6. set storage location ----------
CREATE FUNCTION public.set_storage_location(p_kind text, p_id uuid, p_location_id uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role   employee_role := get_my_role();
  v_active boolean;
  v_code   text;
BEGIN
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('error', '인증이 필요합니다.');
  END IF;
  IF v_role NOT IN ('ADMIN', 'MANAGER') THEN
    RETURN jsonb_build_object('error', '보관 위치 변경 권한이 없습니다.');
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('ITEM', 'DONOR') THEN
    RETURN jsonb_build_object('error', '대상 종류가 올바르지 않습니다.');
  END IF;

  IF p_location_id IS NOT NULL THEN
    SELECT is_active, code INTO v_active, v_code FROM storage_locations WHERE id = p_location_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', '보관 위치를 찾을 수 없습니다.');
    END IF;
    IF NOT v_active THEN
      RETURN jsonb_build_object('error', '사용 중지된 보관 위치입니다.');
    END IF;
  END IF;

  IF p_kind = 'ITEM' THEN
    UPDATE inventory_items SET storage_location_id = p_location_id WHERE id = p_id;
  ELSE
    UPDATE donor_devices SET storage_location_id = p_location_id WHERE id = p_id;
  END IF;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', CASE WHEN p_kind = 'ITEM' THEN '재고 항목을 찾을 수 없습니다.' ELSE 'Donor 기기를 찾을 수 없습니다.' END);
  END IF;

  RETURN jsonb_build_object('success', true, 'location', v_code);
END;
$$;
COMMENT ON FUNCTION public.set_storage_location(text, uuid, uuid) IS '재고 행/Donor 기기의 보관 위치 변경 (ADMIN/MANAGER). NULL이면 해제';

-- ---------- 7. privileges ----------
REVOKE ALL ON FUNCTION public.label_lookup(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_storage_location(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.label_lookup(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_storage_location(text, uuid, uuid) TO authenticated;
