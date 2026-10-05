-- =============================================================
-- Phase 7 rollback (plan §5). Run AFTER reverting the app commit. Local rehearsal only; Brad runs it in production if ever needed.
-- Effect: label codes and storage locations are lost. qty-1 rows created while Phase 7 was active stay as ordinary stock rows (R9).
-- =============================================================
BEGIN;
DROP FUNCTION IF EXISTS public.label_lookup(text);
DROP FUNCTION IF EXISTS public.set_storage_location(text, uuid, uuid);
ALTER TABLE public.donor_devices   DROP COLUMN IF EXISTS storage_location_id;
ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS storage_location_id;
ALTER TABLE public.inventory_items DROP COLUMN IF EXISTS label_code;
DROP FUNCTION IF EXISTS public.ri_next_item_label();
DROP SEQUENCE IF EXISTS public.inventory_label_seq;
DROP TABLE IF EXISTS public.storage_locations;

-- restore the Phase 2 body (merge behaviour), verbatim from 20261001134100_inventory_flow_rpcs.sql §1.
-- CREATE OR REPLACE keeps the existing ACL (no EXECUTE for PUBLIC/anon/authenticated/service_role).
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
COMMIT;
