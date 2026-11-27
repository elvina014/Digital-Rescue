-- Phase 4.1 rollback — restores the schema before 20261127090000_donor_store_devices.sql
-- Refuses while STORE_STOCK donors exist (they cannot satisfy source_ticket_id NOT NULL).
-- Inventory items created from store donors stay as normal stock (by design).
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.donor_devices WHERE origin = 'STORE_STOCK') THEN
    RAISE EXCEPTION 'STORE_STOCK donor rows exist — export/handle them before rollback';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.donor_register_store_device(boolean, public.device_type, text, text, text, text, uuid, uuid, uuid, text, text, uuid, date, integer);

-- donor_extract_part: verbatim Phase 0.6 body (20261003141631_api_guard_ri.sql)
CREATE OR REPLACE FUNCTION public.donor_extract_part(p_candidate_id uuid, p_category_id uuid DEFAULT NULL::uuid, p_spec text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_capacity text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role     employee_role := get_my_role();
  v_cand     donor_part_candidates;
  v_donor    donor_devices;
  v_category uuid;
  v_spec     text;
  v_name     text;
  v_capacity text;
  v_item_id  uuid;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'MANAGER') THEN
    RAISE EXCEPTION '적출 입고 권한이 없습니다. 관리자 또는 팀장만 가능합니다.';
  END IF;

  SELECT * INTO v_cand FROM donor_part_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '적출 후보 부품을 찾을 수 없습니다.';
  END IF;
  IF v_cand.status NOT IN ('AVAILABLE', 'REQUESTED') THEN
    RAISE EXCEPTION '적출 가능 또는 입고 요청 상태의 부품만 입고할 수 있습니다.';
  END IF;

  SELECT * INTO v_donor FROM donor_devices WHERE id = v_cand.donor_id FOR SHARE;
  IF v_donor.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION '보관 중인 Donor 기기의 부품만 입고할 수 있습니다.';
  END IF;

  -- 입력값이 있으면 입력값 전체를, 없으면 요청 시 저장된 값을 사용
  IF p_category_id IS NOT NULL OR NULLIF(btrim(p_spec), '') IS NOT NULL OR NULLIF(btrim(p_name), '') IS NOT NULL THEN
    v_category := p_category_id;
    v_spec     := btrim(coalesce(p_spec, ''));
    v_name     := btrim(coalesce(p_name, ''));
    v_capacity := NULLIF(btrim(p_capacity), '');
  ELSE
    v_category := v_cand.category_id;
    v_spec     := btrim(coalesce(v_cand.return_spec, ''));
    v_name     := btrim(coalesce(v_cand.return_name, ''));
    v_capacity := NULLIF(btrim(v_cand.return_capacity), '');
  END IF;
  IF v_category IS NULL OR v_spec = '' OR v_name = '' THEN
    RAISE EXCEPTION '입고할 카테고리·사양·제품명을 입력해 주세요.';
  END IF;
  IF v_spec = '외주' THEN
    RAISE EXCEPTION '외주 항목으로는 입고할 수 없습니다.';
  END IF;

  v_item_id := ri_inbound_extracted_part(v_category, v_spec, v_name, v_capacity, v_cand.quantity,
                                         v_donor.source_ticket_id, auth.uid());

  UPDATE donor_part_candidates
     SET status = 'EXTRACTED', extracted_at = now(), extracted_by = auth.uid(), inventory_item_id = v_item_id,
         category_id = v_category, return_spec = v_spec, return_name = v_name, return_capacity = v_capacity
   WHERE id = p_candidate_id;

  RETURN jsonb_build_object('item_id', v_item_id, 'donor_id', v_donor.id);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.donor_extract_part(uuid,uuid,text,text,text) TO anon;

-- label_lookup: verbatim Phase 0.6 body (20261003141631_api_guard_ri.sql)
CREATE OR REPLACE FUNCTION public.label_lookup(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role  employee_role := get_my_role();
  v_code  text := upper(btrim(coalesce(p_code, '')));
  v_item  jsonb;
  v_id    uuid;
  v_hist  jsonb;
  v_donor jsonb;
  v_cands jsonb;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.label_lookup(text) TO anon;

-- ri_purchase_resources: verbatim Phase 0.6 body (20261003141631_api_guard_ri.sql)
CREATE OR REPLACE FUNCTION public.ri_purchase_resources(p_material_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item      record;
  v_ticket    record;
  v_part_type text;
  v_compat    uuid[] := '{}';
  v_seen      uuid[] := '{}';
  v_res       jsonb := '[]'::jsonb;
  r           record;
BEGIN
  PERFORM public.ri_api_guard_invoker('{anon,authenticated}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.ri_purchase_resources(uuid) TO anon, authenticated;

REVOKE UPDATE (acquisition_note, acquired_on, acquisition_cost) ON public.donor_devices FROM authenticated;
ALTER TABLE public.donor_devices DROP CONSTRAINT IF EXISTS donor_devices_origin_source;
ALTER TABLE public.donor_devices ALTER COLUMN source_ticket_id SET NOT NULL;
ALTER TABLE public.donor_devices
  DROP COLUMN IF EXISTS acquisition_cost,
  DROP COLUMN IF EXISTS acquired_on,
  DROP COLUMN IF EXISTS acquisition_note,
  DROP COLUMN IF EXISTS origin;
COMMENT ON COLUMN public.donor_devices.source_ticket_id IS NULL;
COMMENT ON COLUMN public.donor_devices.consent_confirmed_by IS '소유권 포기 동의를 확인한 직원';
COMMENT ON COLUMN public.donor_devices.consent_confirmed_at IS NULL;
NOTIFY pgrst, 'reload schema';
COMMIT;
