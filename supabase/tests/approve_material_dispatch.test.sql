-- =============================================================
-- Phase 0.5 — approve_material_dispatch: old vs new
-- Run: npx supabase test db   (local only; everything is rolled back)
--
-- The pre-fix function (baseline 20260927141005, lines 386–458) is recreated
-- verbatim as pg_temp.approve_old. Each case builds two identical fixtures,
-- runs the old function on one and the new one on the other, and compares.
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(24);

-- ---------- pre-fix function, verbatim ----------
CREATE FUNCTION pg_temp.approve_old(p_material_id uuid, p_user_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_item_id      UUID;
  v_ticket_id    UUID;
  v_quantity     INTEGER;
  v_status       TEXT;
  v_inv_qty      INTEGER;
  v_requester_id UUID;   -- 자재를 요청한 담당기사 ID
BEGIN
  -- 1) ticket_materials 조회 (created_by = 요청자)
  SELECT inventory_item_id, ticket_id, quantity, request_status, created_by
    INTO v_item_id, v_ticket_id, v_quantity, v_status, v_requester_id
    FROM ticket_materials
   WHERE id = p_material_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '자재 요청을 찾을 수 없습니다.');
  END IF;

  -- request_status가 'requested' 또는 'pending'인 경우 모두 허용 (기존 데이터 호환)
  IF v_status NOT IN ('requested', 'pending') THEN
    RETURN jsonb_build_object('error', '출고 요청 상태가 아닙니다. (현재: ' || v_status || ')');
  END IF;

  -- 2) 재고 수량 확인
  SELECT quantity INTO v_inv_qty
    FROM inventory_items
   WHERE id = v_item_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '재고 아이템을 찾을 수 없습니다.');
  END IF;

  IF v_inv_qty < v_quantity THEN
    RETURN jsonb_build_object('error', '재고 부족 (현재 ' || v_inv_qty || '개, 요청 ' || v_quantity || '개)');
  END IF;

  -- 3) 재고 차감
  UPDATE inventory_items
     SET quantity   = quantity - v_quantity,
         updated_at = now()
   WHERE id = v_item_id;

  -- 4) ticket_materials 승인 처리
  UPDATE ticket_materials
     SET request_status = 'approved',
         updated_at     = now()
   WHERE id = p_material_id;

  -- 5) inventory_transactions OUTBOUND 기록 (담당자 = 자재 요청자 created_by)
  INSERT INTO inventory_transactions (
    item_id,
    user_id,
    transaction_type,
    quantity_changed,
    ticket_id,
    notes
  ) VALUES (
    v_item_id,
    COALESCE(v_requester_id, p_user_id),  -- 요청자 우선, 없으면 승인자
    'OUTBOUND',
    v_quantity,
    v_ticket_id,
    '자재 출고 승인'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ---------- shared fixtures ----------
INSERT INTO inventory_categories (id, name) VALUES ('10000000-0000-4000-8000-000000000001', 'T05 카테고리');
INSERT INTO inventory_specs (id, category_id, name) VALUES ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'T05 스펙');
INSERT INTO inventory_products (id, spec_id, name) VALUES ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'T05 제품');
INSERT INTO customers (id, name, phone) VALUES ('10000000-0000-4000-8000-000000000004', 'T05 고객', '010-0000-9999');
INSERT INTO repair_tickets (id, customer_id, receipt_type, device_brand, symptoms, status)
VALUES ('10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000004', 'WALK_IN', 'T05', 'T05', 'IN_PROGRESS');

-- tech = requester, admin = approver (seed employees)
CREATE FUNCTION pg_temp.tech()  RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-a000-000000000004'::uuid $$;
CREATE FUNCTION pg_temp.admin() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-a000-000000000001'::uuid $$;

-- Build one fixture (item + material) and run the chosen function.
-- Returns the RPC result plus the observable effects (without generated ids).
CREATE FUNCTION pg_temp.run_case(p_old boolean, p_stock int, p_qty int, p_status text,
                                 p_type text, p_null_requester boolean, p_unknown boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_item uuid := gen_random_uuid();
  v_mat  uuid := gen_random_uuid();
  v_res  jsonb;
BEGIN
  INSERT INTO inventory_items (id, category_id, spec_id, product_id, capacity, condition, quantity, base_estimate)
  VALUES (v_item, '10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000003', v_item::text, 'NEW', p_stock, 10000);
  INSERT INTO ticket_materials (id, ticket_id, inventory_item_id, quantity, request_status, request_type, created_by)
  VALUES (v_mat, '10000000-0000-4000-8000-000000000005', v_item, p_qty, p_status::material_request_status,
          p_type, CASE WHEN p_null_requester THEN NULL ELSE pg_temp.tech() END);

  IF p_unknown THEN v_mat := gen_random_uuid(); END IF;

  IF p_old THEN v_res := pg_temp.approve_old(v_mat, pg_temp.admin());
  ELSE          v_res := public.approve_material_dispatch(v_mat, pg_temp.admin());
  END IF;

  RETURN jsonb_build_object(
    'result', v_res,
    'stock',  (SELECT quantity FROM inventory_items WHERE id = v_item),
    'status', (SELECT request_status::text FROM ticket_materials WHERE inventory_item_id = v_item),
    'tx',     (SELECT coalesce(jsonb_agg(jsonb_build_object(
                  'type', transaction_type, 'qty', quantity_changed, 'user', user_id,
                  'ticket', ticket_id, 'notes', notes)), '[]'::jsonb)
               FROM inventory_transactions WHERE item_id = v_item)
  );
END $$;

-- ---------- dispatch: old = new ----------
SELECT is(pg_temp.run_case(false, 3, 1, 'requested', 'dispatch', false),
          pg_temp.run_case(true,  3, 1, 'requested', 'dispatch', false),
          '1 dispatch, enough stock: identical to old');
SELECT is(pg_temp.run_case(false, 3, 1, 'requested', 'dispatch', false) -> 'stock', '2'::jsonb,
          '1b dispatch deducts stock');
SELECT is(jsonb_array_length(pg_temp.run_case(false, 3, 1, 'requested', 'dispatch', false) -> 'tx'), 1,
          '1c dispatch writes exactly one OUTBOUND');
SELECT is(pg_temp.run_case(false, 5, 2, 'pending', 'dispatch', false),
          pg_temp.run_case(true,  5, 2, 'pending', 'dispatch', false),
          '2 dispatch from legacy pending: identical');
SELECT is(pg_temp.run_case(false, 0, 1, 'requested', 'dispatch', false),
          pg_temp.run_case(true,  0, 1, 'requested', 'dispatch', false),
          '3 dispatch, no stock: identical');
SELECT is(pg_temp.run_case(false, 0, 1, 'requested', 'dispatch', false) #>> '{result,error}',
          '재고 부족 (현재 0개, 요청 1개)', '3b dispatch, no stock: same error text');
SELECT is(pg_temp.run_case(false, 1, 2, 'requested', 'dispatch', false),
          pg_temp.run_case(true,  1, 2, 'requested', 'dispatch', false),
          '3c dispatch, stock < qty: identical');
SELECT is(pg_temp.run_case(false, 3, 1, 'approved', 'dispatch', false),
          pg_temp.run_case(true,  3, 1, 'approved', 'dispatch', false),
          '4a dispatch already approved: identical');
SELECT is(pg_temp.run_case(false, 3, 1, 'cancelled', 'dispatch', false),
          pg_temp.run_case(true,  3, 1, 'cancelled', 'dispatch', false),
          '4b dispatch cancelled: identical');
SELECT is(pg_temp.run_case(false, 3, 1, 'rejected', 'dispatch', false),
          pg_temp.run_case(true,  3, 1, 'rejected', 'dispatch', false),
          '4c dispatch rejected: identical');
SELECT is(pg_temp.run_case(false, 3, 1, 'cancel_requested', 'dispatch', false),
          pg_temp.run_case(true,  3, 1, 'cancel_requested', 'dispatch', false),
          '4d dispatch cancel_requested: identical');
SELECT is(pg_temp.run_case(false, 3, 1, 'requested', 'dispatch', false, true),
          pg_temp.run_case(true,  3, 1, 'requested', 'dispatch', false, true),
          '5 unknown material id: identical');
SELECT is(pg_temp.run_case(false, 3, 1, 'requested', 'dispatch', true),
          pg_temp.run_case(true,  3, 1, 'requested', 'dispatch', true),
          '6 dispatch without requester (OUTBOUND user = approver): identical');

-- ---------- purchase: the fix ----------
SELECT is(pg_temp.run_case(true, 0, 1, 'requested', 'purchase', false) #>> '{result,error}',
          '재고 부족 (현재 0개, 요청 1개)', '7a old: purchase with stock 0 failed (bug documented)');
SELECT is(pg_temp.run_case(false, 0, 1, 'requested', 'purchase', false),
          jsonb_build_object('result', jsonb_build_object('success', true), 'stock', 0, 'status', 'approved', 'tx', '[]'::jsonb),
          '7b new: purchase with stock 0 approved, stock unchanged, no transaction');
SELECT is(pg_temp.run_case(true, 5, 1, 'requested', 'purchase', false) -> 'stock', '4'::jsonb,
          '8a old: purchase with stock 5 deducted stock (bug documented)');
SELECT is(pg_temp.run_case(false, 5, 1, 'requested', 'purchase', false),
          jsonb_build_object('result', jsonb_build_object('success', true), 'stock', 5, 'status', 'approved', 'tx', '[]'::jsonb),
          '8b new: purchase with stock 5 approved, stock unchanged, no transaction');
SELECT is(pg_temp.run_case(false, 5, 1, 'pending', 'purchase', false) -> 'status', '"approved"'::jsonb,
          '8c new: purchase from legacy pending approved');
SELECT is(pg_temp.run_case(false, 0, 1, 'approved', 'purchase', false),
          pg_temp.run_case(true,  0, 1, 'approved', 'purchase', false),
          '9 purchase already approved: same error as before');
SELECT is(pg_temp.run_case(false, 0, 1, 'approved', 'purchase', false) #>> '{result,error}',
          '출고 요청 상태가 아닙니다. (현재: approved)', '9b error text');

-- ---------- privileges and definition unchanged ----------
SELECT ok(NOT has_function_privilege('anon', 'public.approve_material_dispatch(uuid, uuid)', 'EXECUTE'),
          '10a anon cannot execute');
SELECT ok(NOT has_function_privilege('authenticated', 'public.approve_material_dispatch(uuid, uuid)', 'EXECUTE'),
          '10b authenticated cannot execute');
SELECT ok(has_function_privilege('service_role', 'public.approve_material_dispatch(uuid, uuid)', 'EXECUTE'),
          '10c service_role can execute');
SELECT is((SELECT prosecdef::text || '|' || coalesce(array_to_string(proconfig, ','), '<null>')
             FROM pg_proc WHERE oid = 'public.approve_material_dispatch(uuid, uuid)'::regprocedure),
          'true|<null>', '11 SECURITY DEFINER, no proconfig (unchanged)');

SELECT * FROM finish();
ROLLBACK;
