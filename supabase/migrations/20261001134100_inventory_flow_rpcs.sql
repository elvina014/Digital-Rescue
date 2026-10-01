-- =============================================================
-- Phase 2 (M2) — Transactional RPCs for extracted-part inbound and material return (Q3)
-- Plan: docs/repair-intelligence/phases/phase-2-plan.md (APPROVED 2026-10-01)
--
-- New functions only. They re-implement the multi-statement server actions
-- registerReturnMaterialAction / approveReturnMaterialAction / confirmMaterialReturnAction
-- as single transactions, and add inbound for removed parts without a ticket_materials row.
-- Existing functions are called (recalc_ticket_material_cost), never changed.
-- Rollback SQL: see the plan §6 / phase-2-report.md.
-- =============================================================

-- ---------- 1. internal: book an extracted part into stock ----------
-- 스펙/제품 조회 또는 생성 → 중고(USED) 재고 조회(+수량) 또는 생성 → INBOUND 기록.
-- 직접 호출 불가 (EXECUTE 권한 없음). 아래 SECURITY DEFINER 함수와 Phase 4 Donor 적출에서만 사용.
CREATE FUNCTION public.ri_inbound_extracted_part(
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

  -- 적출품은 모두 중고(USED)로 입고. 용량까지 일치하는 재고에만 합산한다.
  SELECT id INTO v_item_id
    FROM inventory_items
   WHERE category_id = p_category_id AND spec_id = v_spec_id AND product_id = v_product_id
     AND condition = 'USED' AND capacity IS NOT DISTINCT FROM v_capacity
   ORDER BY created_at, id
   LIMIT 1
     FOR UPDATE;

  IF FOUND THEN
    UPDATE inventory_items
       SET quantity = quantity + p_quantity, updated_at = now()
     WHERE id = v_item_id;
  ELSE
    INSERT INTO inventory_items (category_id, spec_id, product_id, capacity, condition, quantity, base_estimate)
    VALUES (p_category_id, v_spec_id, v_product_id, v_capacity, 'USED', p_quantity, 0)
    RETURNING id INTO v_item_id;
  END IF;

  INSERT INTO inventory_transactions (item_id, user_id, transaction_type, quantity_changed, ticket_id, notes)
  VALUES (v_item_id, p_tx_user_id, 'INBOUND', p_quantity, p_ticket_id, '적출품 반환 입고');

  RETURN v_item_id;
END;
$$;
COMMENT ON FUNCTION public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid) IS '내부용: 적출품을 중고 재고로 입고 (스펙/제품/재고 조회·생성 + INBOUND). 직접 호출 불가';

-- ---------- 2. 적출/반환 자재 등록 (담당 기사) ----------
CREATE FUNCTION public.register_return_material(
  p_material_id uuid, p_category_id uuid, p_spec text, p_name text, p_condition text,
  p_quantity integer DEFAULT 1, p_capacity text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role       employee_role := get_my_role();
  v_ticket_id  uuid;
  v_status     material_request_status;
  v_registered boolean;
  v_assignee   uuid;
  v_spec       text := btrim(coalesce(p_spec, ''));
  v_name       text := btrim(coalesce(p_name, ''));
  v_capacity   text := NULLIF(btrim(p_capacity), '');
  v_qty        integer := greatest(1, coalesce(p_quantity, 1));
BEGIN
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('error', '인증이 필요합니다.');
  END IF;

  SELECT m.ticket_id, m.request_status, m.is_return_registered, t.assignee_id
    INTO v_ticket_id, v_status, v_registered, v_assignee
    FROM ticket_materials m
    JOIN repair_tickets t ON t.id = m.ticket_id
   WHERE m.id = p_material_id
     FOR UPDATE OF m;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '자재 항목을 찾을 수 없습니다.');
  END IF;
  IF NOT (v_role IN ('ADMIN', 'MANAGER')
          OR (v_role IN ('TECHNICIAN', 'EXPERT_REPAIR') AND v_assignee = auth.uid())) THEN
    RETURN jsonb_build_object('error', '적출품 등록 권한이 없습니다.');
  END IF;
  IF v_registered THEN
    RETURN jsonb_build_object('error', '이미 반환 등록된 항목입니다.');
  END IF;
  IF v_status NOT IN ('approved', 'cancel_requested', 'cancelled') THEN
    RETURN jsonb_build_object('error', '승인/취소 상태의 자재만 반환 등록이 가능합니다.');
  END IF;
  IF p_category_id IS NULL OR v_spec = '' OR v_name = '' THEN
    RETURN jsonb_build_object('error', '카테고리와 상품을 선택해 주세요.');
  END IF;
  IF p_condition IS NULL OR p_condition NOT IN ('중고품', '불량품') THEN
    RETURN jsonb_build_object('error', '상태를 선택해 주세요.');
  END IF;
  IF char_length(v_capacity) > 50 THEN
    RETURN jsonb_build_object('error', '용량은 50자 이내로 입력해 주세요.');
  END IF;

  UPDATE ticket_materials
     SET is_return_registered = true,
         return_category_id   = p_category_id,
         return_spec          = v_spec,
         return_name          = v_name,
         return_condition     = p_condition,
         return_quantity      = v_qty,
         return_capacity      = v_capacity,
         return_status        = 'pending'
   WHERE id = p_material_id;

  INSERT INTO ticket_logs (ticket_id, employee_id, message)
  VALUES (v_ticket_id, auth.uid(),
          '시스템: 적출 자재가 등록되었습니다. (' || v_spec || ' / ' || v_name
          || coalesce(' / ' || v_capacity, '') || ' / ' || p_condition || ' × ' || v_qty || '개)');

  RETURN jsonb_build_object('success', true, 'ticket_id', v_ticket_id);
END;
$$;
COMMENT ON FUNCTION public.register_return_material(uuid, uuid, text, text, text, integer, text) IS '적출/반환 자재 등록 (ADMIN/MANAGER/배정 기사). 입고 승인 대기 상태로 표시 + 로그';

-- ---------- 3. 적출/반환 자재 입고 승인 (관리자/팀장) ----------
CREATE FUNCTION public.approve_return_material(p_material_id uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role          employee_role := get_my_role();
  v_mat           ticket_materials;
  v_orig_category uuid;
  v_category_id   uuid;
  v_category_name text;
  v_assignee      uuid;
  v_qty           integer;
  v_capacity      text;
  v_item_id       uuid;
BEGIN
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('error', '인증이 필요합니다.');
  END IF;
  IF v_role NOT IN ('ADMIN', 'MANAGER') THEN
    RETURN jsonb_build_object('error', '입고 승인 권한이 없습니다.');
  END IF;

  SELECT * INTO v_mat FROM ticket_materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '자재 항목을 찾을 수 없습니다.');
  END IF;
  IF NOT v_mat.is_return_registered OR v_mat.return_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('error', '입고 대기 상태가 아닙니다.');
  END IF;

  -- return_category_id가 있으면 사용, 없으면 원본 자재의 카테고리 (하위 호환)
  SELECT category_id INTO v_orig_category FROM inventory_items WHERE id = v_mat.inventory_item_id;
  v_category_id := coalesce(v_mat.return_category_id, v_orig_category);
  IF v_category_id IS NULL THEN
    RETURN jsonb_build_object('error', '반환 자재의 카테고리를 찾을 수 없습니다.');
  END IF;

  v_qty      := coalesce(v_mat.return_quantity, 1);
  v_capacity := NULLIF(btrim(v_mat.return_capacity), '');

  -- 입출고 기록의 담당자는 담당 기사 (없으면 승인자)
  SELECT assignee_id INTO v_assignee FROM repair_tickets WHERE id = v_mat.ticket_id;

  UPDATE ticket_materials SET return_status = 'approved' WHERE id = p_material_id;

  v_item_id := ri_inbound_extracted_part(v_category_id, v_mat.return_spec, v_mat.return_name, v_capacity, v_qty,
                                         v_mat.ticket_id, coalesce(v_assignee, auth.uid()));

  SELECT name INTO v_category_name FROM inventory_categories WHERE id = v_category_id;

  INSERT INTO ticket_logs (ticket_id, employee_id, message)
  VALUES (v_mat.ticket_id, auth.uid(),
          '시스템: 적출 자재 입고 승인 완료 (' || coalesce(v_category_name, '카테고리') || ' / ' || v_mat.return_spec
          || ' / ' || v_mat.return_name || coalesce(' / ' || v_capacity, '') || ' / ' || v_mat.return_condition || ')');

  RETURN jsonb_build_object('success', true, 'ticket_id', v_mat.ticket_id, 'item_id', v_item_id);
END;
$$;
COMMENT ON FUNCTION public.approve_return_material(uuid) IS '적출/반환 자재 입고 승인 (ADMIN/MANAGER): 상태 변경 + 중고 재고 입고 + INBOUND + 로그를 단일 트랜잭션으로 처리';

-- ---------- 4. 자재 반환 확인 (관리자/팀장 — 재고 복구 + 자재비 재계산) ----------
CREATE FUNCTION public.confirm_material_return(p_material_id uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role  employee_role := get_my_role();
  v_mat   ticket_materials;
  v_label text;
BEGIN
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('error', '인증이 필요합니다.');
  END IF;
  IF v_role NOT IN ('ADMIN', 'MANAGER') THEN
    RETURN jsonb_build_object('error', '반환 확인 권한이 없습니다.');
  END IF;

  SELECT * INTO v_mat FROM ticket_materials WHERE id = p_material_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '자재 항목을 찾을 수 없습니다.');
  END IF;
  IF v_mat.request_status <> 'cancel_requested' THEN
    RETURN jsonb_build_object('error', '반환 대기 상태가 아닙니다. (현재: ' || v_mat.request_status || ')');
  END IF;

  UPDATE ticket_materials SET request_status = 'cancelled' WHERE id = p_material_id;

  -- 출고(dispatch)만 재고 복구. 구매(purchase)는 재고를 차감한 적이 없다.
  IF v_mat.request_type = 'dispatch' THEN
    PERFORM 1 FROM inventory_items WHERE id = v_mat.inventory_item_id FOR UPDATE;
    UPDATE inventory_items
       SET quantity = quantity + v_mat.quantity, updated_at = now()
     WHERE id = v_mat.inventory_item_id;

    INSERT INTO inventory_transactions (item_id, user_id, transaction_type, quantity_changed, ticket_id, notes)
    VALUES (v_mat.inventory_item_id, auth.uid(), 'INBOUND', v_mat.quantity, v_mat.ticket_id, '접수 취소로 인한 자재 원복');
  END IF;

  PERFORM recalc_ticket_material_cost(v_mat.ticket_id);

  SELECT concat_ws(' / ', NULLIF(c.name, ''), NULLIF(s.name, ''), NULLIF(p.name, ''), NULLIF(i.capacity, ''))
    INTO v_label
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON c.id = i.category_id
    LEFT JOIN inventory_specs s ON s.id = i.spec_id
    LEFT JOIN inventory_products p ON p.id = i.product_id
   WHERE i.id = v_mat.inventory_item_id;

  INSERT INTO ticket_logs (ticket_id, employee_id, message)
  VALUES (v_mat.ticket_id, auth.uid(),
          '시스템: ' || CASE WHEN v_mat.request_type = 'purchase' THEN '자재 구매' ELSE '자재 출고' END
          || ' 반환이 확인되었습니다. (' || coalesce(v_label, '') || ') (재고 복구 완료)');

  RETURN jsonb_build_object('success', true, 'ticket_id', v_mat.ticket_id);
END;
$$;
COMMENT ON FUNCTION public.confirm_material_return(uuid) IS '취소 자재 반환 확인 (ADMIN/MANAGER): 상태 변경 + 재고 복구 + INBOUND + 자재비 재계산 + 로그를 단일 트랜잭션으로 처리';

-- ---------- 5. 적출 부품(자재 행 없음) 입고 승인 (관리자/팀장) ----------
CREATE FUNCTION public.approve_removed_part_inbound(p_removed_part_id uuid) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role          employee_role := get_my_role();
  v_part          ticket_removed_parts;
  v_assignee      uuid;
  v_capacity      text;
  v_category_name text;
  v_item_id       uuid;
BEGIN
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('error', '인증이 필요합니다.');
  END IF;
  IF v_role NOT IN ('ADMIN', 'MANAGER') THEN
    RETURN jsonb_build_object('error', '입고 승인 권한이 없습니다.');
  END IF;

  SELECT * INTO v_part FROM ticket_removed_parts WHERE id = p_removed_part_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '적출 부품을 찾을 수 없습니다.');
  END IF;
  IF v_part.disposition IS DISTINCT FROM 'STOCK' OR v_part.inbound_approved_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', '입고 대기 상태가 아닙니다.');
  END IF;

  v_capacity := NULLIF(btrim(v_part.return_capacity), '');
  SELECT assignee_id INTO v_assignee FROM repair_tickets WHERE id = v_part.ticket_id;

  v_item_id := ri_inbound_extracted_part(v_part.category_id, btrim(v_part.return_spec), btrim(v_part.return_name),
                                         v_capacity, v_part.quantity, v_part.ticket_id, coalesce(v_assignee, auth.uid()));

  UPDATE ticket_removed_parts
     SET inbound_approved_at = now(), inbound_approved_by = auth.uid(), inventory_item_id = v_item_id
   WHERE id = p_removed_part_id;

  SELECT name INTO v_category_name FROM inventory_categories WHERE id = v_part.category_id;

  INSERT INTO ticket_logs (ticket_id, employee_id, message)
  VALUES (v_part.ticket_id, auth.uid(),
          '시스템: 적출 자재 입고 승인 완료 (' || coalesce(v_category_name, '카테고리') || ' / ' || btrim(v_part.return_spec)
          || ' / ' || btrim(v_part.return_name) || coalesce(' / ' || v_capacity, '') || ' / ' || v_part.return_condition || ')');

  RETURN jsonb_build_object('success', true, 'ticket_id', v_part.ticket_id, 'item_id', v_item_id);
END;
$$;
COMMENT ON FUNCTION public.approve_removed_part_inbound(uuid) IS '자재 출고 행 없이 등록된 적출 부품의 입고 승인 (ADMIN/MANAGER), 단일 트랜잭션';

-- ---------- 6. privileges ----------
REVOKE ALL ON FUNCTION public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_return_material(uuid, uuid, text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_return_material(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_material_return(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_removed_part_inbound(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.register_return_material(uuid, uuid, text, text, text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_return_material(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_material_return(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_removed_part_inbound(uuid) TO authenticated;
