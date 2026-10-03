-- Phase 0.6 — API guard: Repair Intelligence functions, Phases 1–7 (0.6b)
-- KI-8: supautils segfaults on function privilege errors for roles in supautils.hint_roles (anon, authenticated, service_role).
-- R10: exposed functions refuse callers inside the function, never by withholding EXECUTE from a hint role.
-- Each function below = its definition before this migration + ONE guard statement (see phase-0.6-plan.md §3).
-- Signature, return type, language, SECURITY DEFINER/INVOKER, volatility and search_path are unchanged.
-- Rollback: supabase/test-fixtures/phase0.6/rollback.sql
-- Functions: approve_removed_part_inbound, approve_return_material, catalog_create_model, catalog_keep_ticket_updated_at, catalog_map_model_string, catalog_normalize, catalog_search_boards, catalog_search_models, catalog_set_updated_at, catalog_unmap_alias, catalog_unmapped_model_strings, confirm_material_return, donor_convert_from_ticket, donor_extract_part, get_device_knowledge, label_lookup, model_note_stamp, part_set_updated_at, part_spec_create, part_spec_search, purchase_guard_check, record_compatibility_result, record_part_install_result, register_return_material, repair_gate_check, repair_gate_override, repair_record_can_edit, repair_removed_part_stamp, repair_set_cancel_result, repair_set_updated_at, request_purchase_material, retract_compatibility_evidence, ri_compatibility_row, ri_inbound_extracted_part, ri_next_item_label, ri_purchase_guard_enforce, ri_purchase_material_info, ri_purchase_resources, ri_recompute_compatibility, search_devices_for_part, search_parts_for_device, set_storage_location

-- approve_removed_part_inbound: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.approve_removed_part_inbound(p_removed_part_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role          employee_role := get_my_role();
  v_part          ticket_removed_parts;
  v_assignee      uuid;
  v_capacity      text;
  v_category_name text;
  v_item_id       uuid;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.approve_removed_part_inbound(uuid) TO anon;

-- approve_return_material: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.approve_return_material(p_material_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  PERFORM public.ri_api_guard_definer('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.approve_return_material(uuid) TO anon;

-- catalog_create_model: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.catalog_create_model(p_brand text, p_model text, p_device_type device_type DEFAULT NULL::device_type, p_variant text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role       employee_role := get_my_role();
  v_brand_norm text := catalog_normalize(p_brand);
  v_model_norm text := catalog_normalize(p_model);
  v_brand_id   uuid;
  v_model_id   uuid;
  v_variant_id uuid;
  v_existed    boolean := false;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF v_role IS NULL OR v_role = 'CS' THEN
    RAISE EXCEPTION '모델 등록 권한이 없습니다.';
  END IF;
  IF v_brand_norm IS NULL THEN
    RAISE EXCEPTION '브랜드를 입력해 주세요.';
  END IF;
  IF v_model_norm IS NULL THEN
    RAISE EXCEPTION '모델명을 입력해 주세요.';
  END IF;
  IF char_length(trim(p_brand)) > 50 OR char_length(trim(p_model)) > 100
     OR char_length(coalesce(trim(p_variant), '')) > 100 THEN
    RAISE EXCEPTION '입력이 너무 깁니다. (브랜드 50자, 모델·변형 100자 이내)';
  END IF;

  -- 이미 같은 별칭(정규화 기준)이 있으면 그 모델을 돌려준다
  SELECT a.model_id, a.variant_id INTO v_model_id, v_variant_id
    FROM catalog_model_aliases a WHERE a.alias_norm = v_model_norm;

  IF FOUND THEN
    v_existed := true;
  ELSE
    INSERT INTO catalog_brands (name) VALUES (trim(p_brand)) ON CONFLICT (name_norm) DO NOTHING;
    SELECT id INTO v_brand_id FROM catalog_brands WHERE name_norm = v_brand_norm;

    SELECT id INTO v_model_id FROM catalog_models WHERE brand_id = v_brand_id AND name_norm = v_model_norm;
    IF FOUND THEN
      v_existed := true;
    ELSE
      INSERT INTO catalog_models (brand_id, name, device_type, needs_review, created_by)
      VALUES (v_brand_id, trim(p_model), p_device_type, v_role <> 'ADMIN', auth.uid())
      RETURNING id INTO v_model_id;

      INSERT INTO catalog_model_aliases (model_id, alias, source, created_by)
      VALUES (v_model_id, trim(p_model), 'created', auth.uid());
    END IF;
  END IF;

  IF catalog_normalize(p_variant) IS NOT NULL THEN
    INSERT INTO catalog_variants (model_id, name) VALUES (v_model_id, trim(p_variant))
      ON CONFLICT (model_id, name_norm) DO NOTHING;
    SELECT id INTO v_variant_id FROM catalog_variants
     WHERE model_id = v_model_id AND name_norm = catalog_normalize(p_variant);
  END IF;

  RETURN jsonb_build_object('model_id', v_model_id, 'variant_id', v_variant_id, 'existed', v_existed);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.catalog_create_model(text,text,device_type,text) TO anon;

-- catalog_keep_ticket_updated_at: trigger function — grant only (direct calls are refused by Postgres)
GRANT EXECUTE ON FUNCTION public.catalog_keep_ticket_updated_at() TO anon, authenticated;

-- catalog_map_model_string: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.catalog_map_model_string(p_norm text, p_model_id uuid, p_variant_id uuid DEFAULT NULL::uuid, p_alias text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm       text := catalog_normalize(p_norm);
  v_alias      text := coalesce(nullif(trim(p_alias), ''), trim(p_norm));
  v_alias_id   uuid;
  v_alias_mid  uuid;
  v_alias_vid  uuid;
  v_linked     integer;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '관리자만 사용할 수 있습니다.';
  END IF;
  IF v_norm IS NULL THEN
    RAISE EXCEPTION '연결할 모델 문자열이 비어 있습니다.';
  END IF;
  IF catalog_normalize(v_alias) IS NULL THEN
    RAISE EXCEPTION '별칭을 입력해 주세요.';
  END IF;
  IF char_length(v_alias) > 200 THEN
    RAISE EXCEPTION '별칭은 200자 이내로 입력해 주세요.';
  END IF;
  PERFORM 1 FROM catalog_models WHERE id = p_model_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '모델을 찾을 수 없습니다.';
  END IF;
  IF p_variant_id IS NOT NULL THEN
    PERFORM 1 FROM catalog_variants WHERE id = p_variant_id AND model_id = p_model_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '선택한 변형이 모델에 속하지 않습니다.';
    END IF;
  END IF;

  SELECT id, model_id, variant_id INTO v_alias_id, v_alias_mid, v_alias_vid
    FROM catalog_model_aliases WHERE alias_norm = catalog_normalize(v_alias) FOR UPDATE;
  IF FOUND THEN
    IF v_alias_mid <> p_model_id OR v_alias_vid IS DISTINCT FROM p_variant_id THEN
      RAISE EXCEPTION '이미 다른 모델에 연결된 별칭입니다.';
    END IF;
  ELSE
    INSERT INTO catalog_model_aliases (model_id, variant_id, alias, source, created_by)
    VALUES (p_model_id, p_variant_id, v_alias, 'mapping', auth.uid())
    RETURNING id INTO v_alias_id;
  END IF;

  PERFORM set_config('app.catalog_link_sync', 'on', true);

  WITH upd AS (
    UPDATE repair_tickets t
       SET catalog_model_id = p_model_id,
           catalog_variant_id = p_variant_id
     WHERE catalog_normalize(t.device_model) = v_norm
       AND t.catalog_model_id IS NULL
    RETURNING t.id
  )
  INSERT INTO catalog_ticket_link_log (ticket_id, action, alias_id, old_model_id, old_variant_id,
                                       new_model_id, new_variant_id, done_by)
  SELECT upd.id, 'link', v_alias_id, NULL, NULL, p_model_id, p_variant_id, auth.uid() FROM upd;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  PERFORM set_config('app.catalog_link_sync', 'off', true);

  RETURN jsonb_build_object('alias_id', v_alias_id, 'linked', v_linked);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.catalog_map_model_string(text,uuid,uuid,text) TO anon;

-- catalog_normalize: pure function — grant only (decision 3)
GRANT EXECUTE ON FUNCTION public.catalog_normalize(text) TO anon;

-- catalog_search_boards: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.catalog_search_boards(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(board_id uuid, board_number text, manufacturer text, matched text, score real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
SELECT public.ri_api_guard_invoker('{anon}');
  WITH q AS (SELECT public.catalog_normalize(p_query) AS n),
  cand AS (
    SELECT b.id AS board_id, b.board_number AS matched, b.board_number_norm AS norm FROM catalog_boards b
    UNION ALL
    SELECT a.board_id, a.alias, a.alias_norm FROM catalog_board_aliases a
  ),
  scored AS (
    SELECT c.board_id, c.matched,
           (CASE WHEN c.norm = q.n THEN 1.0
                 WHEN c.norm LIKE q.n || '%' THEN 0.9
                 WHEN c.norm LIKE '%' || q.n || '%' THEN 0.8
                 ELSE similarity(c.norm, q.n) END)::real AS score
      FROM cand c, q
     WHERE q.n IS NOT NULL
       AND (c.norm LIKE '%' || q.n || '%' OR similarity(c.norm, q.n) >= 0.2)
  ),
  best AS (
    SELECT DISTINCT ON (s.board_id) s.* FROM scored s ORDER BY s.board_id, s.score DESC
  )
  SELECT b.board_id, bd.board_number, bd.manufacturer, b.matched, b.score
    FROM best b JOIN catalog_boards bd ON bd.id = b.board_id
   ORDER BY b.score DESC, bd.board_number
   LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
$function$;
GRANT EXECUTE ON FUNCTION public.catalog_search_boards(text,integer) TO anon;

-- catalog_search_models: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.catalog_search_models(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(model_id uuid, variant_id uuid, brand_name text, model_name text, variant_name text, matched text, score real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
SELECT public.ri_api_guard_invoker('{anon}');
  WITH q AS (SELECT public.catalog_normalize(p_query) AS n),
  cand AS (
    SELECT a.model_id, a.variant_id, a.alias AS matched, a.alias_norm AS norm
      FROM catalog_model_aliases a
    UNION ALL
    SELECT a.model_id, a.variant_id, a.alias, b.name_norm || a.alias_norm
      FROM catalog_model_aliases a
      JOIN catalog_models m ON m.id = a.model_id
      JOIN catalog_brands b ON b.id = m.brand_id
    UNION ALL
    SELECT m.id, NULL::uuid, m.name, m.name_norm FROM catalog_models m
    UNION ALL
    SELECT m.id, NULL::uuid, m.name, b.name_norm || m.name_norm
      FROM catalog_models m JOIN catalog_brands b ON b.id = m.brand_id
  ),
  scored AS (
    SELECT c.model_id, c.variant_id, c.matched,
           (CASE WHEN c.norm = q.n THEN 1.0
                 WHEN c.norm LIKE q.n || '%' THEN 0.9
                 WHEN c.norm LIKE '%' || q.n || '%' THEN 0.8
                 ELSE similarity(c.norm, q.n) END)::real AS score
      FROM cand c, q
     WHERE q.n IS NOT NULL
       AND (c.norm LIKE '%' || q.n || '%' OR similarity(c.norm, q.n) >= 0.2)
  ),
  best AS (
    SELECT DISTINCT ON (s.model_id, s.variant_id) s.*
      FROM scored s
     ORDER BY s.model_id, s.variant_id, s.score DESC
  )
  SELECT b.model_id, b.variant_id, br.name, m.name, v.name, b.matched, b.score
    FROM best b
    JOIN catalog_models m ON m.id = b.model_id
    JOIN catalog_brands br ON br.id = m.brand_id
    LEFT JOIN catalog_variants v ON v.id = b.variant_id
   ORDER BY b.score DESC, br.name, m.name
   LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
$function$;
GRANT EXECUTE ON FUNCTION public.catalog_search_models(text,integer) TO anon;

-- catalog_set_updated_at: trigger function — grant only (direct calls are refused by Postgres)
GRANT EXECUTE ON FUNCTION public.catalog_set_updated_at() TO anon, authenticated;

-- catalog_unmap_alias: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.catalog_unmap_alias(p_alias_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source   text;
  v_unlinked integer;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '관리자만 사용할 수 있습니다.';
  END IF;
  SELECT source INTO v_source FROM catalog_model_aliases WHERE id = p_alias_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '별칭을 찾을 수 없습니다.';
  END IF;

  PERFORM set_config('app.catalog_link_sync', 'on', true);

  WITH linked AS (
    SELECT DISTINCT ON (l.ticket_id) l.ticket_id, l.new_model_id, l.new_variant_id
      FROM catalog_ticket_link_log l
     WHERE l.alias_id = p_alias_id AND l.action = 'link'
     ORDER BY l.ticket_id, l.done_at DESC
  ),
  upd AS (
    UPDATE repair_tickets t
       SET catalog_model_id = NULL,
           catalog_variant_id = NULL
      FROM linked
     WHERE t.id = linked.ticket_id
       AND t.catalog_model_id = linked.new_model_id
       AND t.catalog_variant_id IS NOT DISTINCT FROM linked.new_variant_id
    RETURNING t.id, linked.new_model_id, linked.new_variant_id
  )
  INSERT INTO catalog_ticket_link_log (ticket_id, action, alias_id, old_model_id, old_variant_id,
                                       new_model_id, new_variant_id, done_by)
  SELECT upd.id, 'unlink', p_alias_id, upd.new_model_id, upd.new_variant_id, NULL, NULL, auth.uid() FROM upd;
  GET DIAGNOSTICS v_unlinked = ROW_COUNT;

  PERFORM set_config('app.catalog_link_sync', 'off', true);

  -- 매핑 도구가 만든 별칭만 삭제 (모델 등록 시 생성된 기본 별칭은 유지)
  IF v_source = 'mapping' THEN
    DELETE FROM catalog_model_aliases WHERE id = p_alias_id;
  END IF;

  RETURN jsonb_build_object('unlinked', v_unlinked, 'alias_deleted', v_source = 'mapping');
END;
$function$;
GRANT EXECUTE ON FUNCTION public.catalog_unmap_alias(uuid) TO anon;

-- catalog_unmapped_model_strings: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.catalog_unmapped_model_strings(p_limit integer DEFAULT 200)
 RETURNS TABLE(norm text, raw_strings text[], brands text[], ticket_count integer, test_count integer, suggestions jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '관리자만 사용할 수 있습니다.';
  END IF;

  RETURN QUERY
  WITH t AS (
    SELECT catalog_normalize(rt.device_model) AS n, rt.device_model::text AS raw, rt.device_brand::text AS brand, rt.is_test
      FROM repair_tickets rt
     WHERE rt.catalog_model_id IS NULL
  ),
  g AS (
    SELECT t.n,
           array_agg(DISTINCT t.raw ORDER BY t.raw) AS raws,
           array_agg(DISTINCT t.brand ORDER BY t.brand) AS brs,
           count(*)::int AS cnt,
           (count(*) FILTER (WHERE t.is_test))::int AS test_cnt
      FROM t WHERE t.n IS NOT NULL
     GROUP BY t.n
     ORDER BY count(*) DESC, t.n
     LIMIT least(greatest(coalesce(p_limit, 200), 1), 1000)
  )
  SELECT g.n, g.raws, g.brs, g.cnt, g.test_cnt,
         coalesce((
           SELECT jsonb_agg(to_jsonb(s) ORDER BY s.score DESC)
             FROM (
               SELECT * FROM (
                 SELECT DISTINCT ON (a.model_id, a.variant_id)
                        a.model_id, a.variant_id, br.name AS brand_name, m.name AS model_name,
                        v.name AS variant_name, a.alias,
                        (CASE WHEN g.n LIKE '%' || a.alias_norm || '%' OR a.alias_norm LIKE '%' || g.n || '%'
                              THEN 0.9 ELSE similarity(a.alias_norm, g.n) END)::real AS score
                   FROM catalog_model_aliases a
                   JOIN catalog_models m ON m.id = a.model_id
                   JOIN catalog_brands br ON br.id = m.brand_id
                   LEFT JOIN catalog_variants v ON v.id = a.variant_id
                  WHERE g.n LIKE '%' || a.alias_norm || '%'
                     OR a.alias_norm LIKE '%' || g.n || '%'
                     OR similarity(a.alias_norm, g.n) >= 0.3
                  ORDER BY a.model_id, a.variant_id,
                           (CASE WHEN g.n LIKE '%' || a.alias_norm || '%' OR a.alias_norm LIKE '%' || g.n || '%'
                                 THEN 0.9 ELSE similarity(a.alias_norm, g.n) END) DESC
               ) d
               ORDER BY d.score DESC
               LIMIT 3
             ) s
         ), '[]'::jsonb)
    FROM g
   ORDER BY g.cnt DESC, g.n;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.catalog_unmapped_model_strings(integer) TO anon;

-- confirm_material_return: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.confirm_material_return(p_material_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role  employee_role := get_my_role();
  v_mat   ticket_materials;
  v_label text;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.confirm_material_return(uuid) TO anon;

-- donor_convert_from_ticket: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.donor_convert_from_ticket(p_ticket_id uuid, p_consent boolean, p_brand text, p_model_text text, p_tag_info text DEFAULT NULL::text, p_condition_note text DEFAULT NULL::text, p_storage_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role   employee_role := get_my_role();
  v_ticket repair_tickets;
  v_brand  text := btrim(coalesce(p_brand, ''));
  v_donor  donor_devices;
  v_copied integer;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'MANAGER') THEN
    RAISE EXCEPTION 'Donor 전환 권한이 없습니다. 관리자 또는 팀장만 가능합니다.';
  END IF;
  IF p_consent IS DISTINCT FROM true THEN
    RAISE EXCEPTION '고객의 소유권 포기(폐기 위임) 동의 확인이 필요합니다.';
  END IF;
  IF v_brand = '' THEN
    RAISE EXCEPTION '브랜드를 입력해 주세요.';
  END IF;

  SELECT * INTO v_ticket FROM repair_tickets WHERE id = p_ticket_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '접수건을 찾을 수 없습니다.';
  END IF;
  IF v_ticket.status <> 'CANCELED' OR v_ticket.cancel_device_disposal IS DISTINCT FROM 'DISPOSE' THEN
    RAISE EXCEPTION '폐기로 취소된 접수건만 Donor로 전환할 수 있습니다.';
  END IF;
  IF v_ticket.dispose_confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION '이미 폐기 확인(또는 Donor 전환)이 완료된 접수건입니다.';
  END IF;
  IF EXISTS (SELECT 1 FROM donor_devices WHERE source_ticket_id = p_ticket_id) THEN
    RAISE EXCEPTION '이미 Donor로 전환된 접수건입니다.';
  END IF;

  INSERT INTO donor_devices (source_ticket_id, device_type, brand, model_text, tag_info,
                             catalog_model_id, catalog_variant_id, catalog_board_id,
                             condition_note, storage_note, consent_confirmed_by, consent_confirmed_at, created_by)
  VALUES (p_ticket_id, v_ticket.device_type, v_brand, NULLIF(btrim(p_model_text), ''), NULLIF(btrim(p_tag_info), ''),
          v_ticket.catalog_model_id, v_ticket.catalog_variant_id, v_ticket.catalog_board_id,
          NULLIF(btrim(p_condition_note), ''), NULLIF(btrim(p_storage_note), ''), auth.uid(), now(), auth.uid())
  RETURNING * INTO v_donor;

  -- 수리 기록에서 'Donor유지'로 처리한 적출 부품은 후보 목록으로 옮긴다
  INSERT INTO donor_part_candidates (donor_id, description, part_spec_id, quantity, condition_estimate,
                                     category_id, return_spec, return_name, return_capacity,
                                     source_removed_part_id, created_by)
  SELECT v_donor.id, r.description, r.part_spec_id, r.quantity,
         CASE WHEN r.return_condition = '불량품' THEN 'FAULTY' ELSE 'UNTESTED' END,
         r.category_id, NULLIF(btrim(r.return_spec), ''), NULLIF(btrim(r.return_name), ''), NULLIF(btrim(r.return_capacity), ''),
         r.id, auth.uid()
    FROM ticket_removed_parts r
   WHERE r.ticket_id = p_ticket_id AND r.disposition = 'DONOR_KEEP'
   ORDER BY r.created_at, r.id;
  GET DIAGNOSTICS v_copied = ROW_COUNT;

  UPDATE repair_tickets SET dispose_confirmed_at = now() WHERE id = p_ticket_id;

  INSERT INTO ticket_logs (ticket_id, employee_id, message)
  VALUES (p_ticket_id, auth.uid(),
          '시스템: 기기가 Donor로 전환되었습니다. (' || v_donor.donor_no || ', 소유권 포기 동의 확인'
          || CASE WHEN v_copied > 0 THEN ', 적출 후보 ' || v_copied || '건' ELSE '' END || ')');

  RETURN jsonb_build_object('donor_id', v_donor.id, 'donor_no', v_donor.donor_no, 'candidates', v_copied);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.donor_convert_from_ticket(uuid,boolean,text,text,text,text,text) TO anon;

-- donor_extract_part: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
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

-- get_device_knowledge: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.get_device_knowledge(p_model_id uuid DEFAULT NULL::uuid, p_variant_id uuid DEFAULT NULL::uuid, p_board_id uuid DEFAULT NULL::uuid, p_exclude_ticket_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role       employee_role := get_my_role();
  v_uid        uuid := auth.uid();
  v_model      uuid := p_model_id;
  v_show_price boolean;
  v_label      text;
  v_boards     jsonb;
  v_board_ids  uuid[];
  v_notes      jsonb;
  v_case_ids   uuid[];
  v_total      integer;
  v_by_result  jsonb;
  v_by_status  jsonb;
  v_recent     jsonb := '[]'::jsonb;
  v_skipped    integer := 0;
  v_case       jsonb;
  v_parts      jsonb;
  v_in_stock   integer := 0;
  v_donors     jsonb;
  r            record;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF v_role IS NULL THEN
    RAISE EXCEPTION '직원만 조회할 수 있습니다.';
  END IF;
  v_show_price := v_role IN ('ADMIN', 'MANAGER');

  IF p_variant_id IS NOT NULL THEN
    SELECT cv.model_id INTO v_model FROM catalog_variants cv
     WHERE cv.id = p_variant_id AND (p_model_id IS NULL OR cv.model_id = p_model_id);
    IF v_model IS NULL THEN
      RAISE EXCEPTION '선택한 변형이 모델에 속하지 않습니다.';
    END IF;
  END IF;
  IF v_model IS NULL AND p_board_id IS NULL THEN
    RAISE EXCEPTION '검색할 모델 또는 보드를 선택해 주세요.';
  END IF;

  -- label + boards
  SELECT concat_ws(' / ',
           (SELECT concat_ws(' ', br.name, cm.name,
                     (SELECT cv.name FROM catalog_variants cv WHERE cv.id = p_variant_id))
              FROM catalog_models cm JOIN catalog_brands br ON br.id = cm.brand_id WHERE cm.id = v_model),
           (SELECT cb.board_number FROM catalog_boards cb WHERE cb.id = p_board_id))
    INTO v_label;

  SELECT coalesce(array_agg(DISTINCT b.id), '{}'::uuid[]),
         coalesce(jsonb_agg(DISTINCT jsonb_build_object('board_id', b.id, 'board_number', b.board_number)), '[]'::jsonb)
    INTO v_board_ids, v_boards
    FROM catalog_boards b
   WHERE b.id = p_board_id
      OR b.id IN (SELECT mb.board_id FROM catalog_model_boards mb
                   WHERE mb.model_id = v_model
                     AND (p_variant_id IS NULL OR mb.variant_id IS NULL OR mb.variant_id = p_variant_id));

  -- notes: 모델(+변형), 보드
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'note_type', n.note_type, 'body', n.body, 'is_pinned', n.is_pinned,
           'target_label', coalesce(cb.board_number, concat_ws(' ', cm.name, cv.name)),
           'author', e.name, 'updated_at', n.updated_at,
           'can_edit', (v_role IN ('ADMIN', 'MANAGER')
                        OR (n.created_by = v_uid AND v_role IN ('TECHNICIAN', 'EXPERT_REPAIR'))))
           ORDER BY n.is_pinned DESC, (n.note_type = 'CAUTION') DESC, n.updated_at DESC), '[]'::jsonb)
    INTO v_notes
    FROM model_notes n
    LEFT JOIN catalog_models cm ON cm.id = n.model_id
    LEFT JOIN catalog_variants cv ON cv.id = n.variant_id
    LEFT JOIN catalog_boards cb ON cb.id = n.board_id
    LEFT JOIN employees e ON e.id = n.created_by
   WHERE (n.model_id = v_model AND (p_variant_id IS NULL OR n.variant_id IS NULL OR n.variant_id = p_variant_id))
      OR n.board_id = ANY (v_board_ids);

  -- cases (테스트 접수 제외, 조회 중인 접수 제외), 최신순
  SELECT coalesce(array_agg(t.id ORDER BY coalesce(t.received_at, t.created_at) DESC, t.id), '{}'::uuid[])
    INTO v_case_ids
    FROM repair_tickets t
   WHERE NOT t.is_test
     AND (p_exclude_ticket_id IS NULL OR t.id <> p_exclude_ticket_id)
     AND ((v_model IS NOT NULL AND t.catalog_model_id = v_model
           AND (p_variant_id IS NULL OR t.catalog_variant_id = p_variant_id))
          OR (p_board_id IS NOT NULL AND t.catalog_board_id = p_board_id));
  v_total := cardinality(v_case_ids);

  SELECT coalesce(jsonb_object_agg(x.k, x.n), '{}'::jsonb) INTO v_by_result
    FROM (SELECT coalesce(rr.result, 'NONE') AS k, count(*) AS n
            FROM unnest(v_case_ids) AS c(id) LEFT JOIN repair_records rr ON rr.ticket_id = c.id
           GROUP BY 1) x;

  SELECT coalesce(jsonb_object_agg(x.k, x.n), '{}'::jsonb) INTO v_by_status
    FROM (SELECT CASE WHEN t.status IN ('COMPLETED', 'CANCELED') THEN t.status::text ELSE 'OPEN' END AS k, count(*) AS n
            FROM unnest(v_case_ids) AS c(id) JOIN repair_tickets t ON t.id = c.id
           GROUP BY 1) x;

  -- recent cases: 하나씩 조립, 오류가 나면 그 사례만 건너뜀 (결정 8)
  FOR r IN SELECT c.id FROM unnest(v_case_ids[1:10]) WITH ORDINALITY AS c(id, ord) ORDER BY c.ord LOOP
    BEGIN
      SELECT jsonb_build_object(
               'receipt_no', t.receipt_no,
               'status', t.status,
               'received_at', t.received_at,
               'completed_at', t.completed_at,
               'canceled_at', t.canceled_at,
               'result', rr.result,
               'fault_category', rr.fault_category,
               'diagnosis_summary', rr.diagnosis_summary,
               'symptoms', (SELECT coalesce(jsonb_agg(sc.name ORDER BY sc.sort_order, sc.name), '[]'::jsonb)
                              FROM ticket_symptoms ts JOIN symptom_codes sc ON sc.id = ts.symptom_code_id
                             WHERE ts.ticket_id = t.id),
               'actions', (SELECT coalesce(jsonb_agg(jsonb_build_object('action_type', a.action_type,
                                                                        'description', a.description,
                                                                        'succeeded', a.succeeded)
                                                     ORDER BY a.sort_order, a.performed_at), '[]'::jsonb)
                             FROM repair_actions a WHERE a.ticket_id = t.id),
               'parts', (SELECT coalesce(jsonb_agg(jsonb_build_object('category', p.category_name, 'spec', p.spec_name,
                                                                      'product', p.product_name, 'capacity', p.capacity,
                                                                      'quantity', p.quantity)
                                                   ORDER BY p.category_name, p.product_name), '[]'::jsonb)
                           FROM repair_parts_used p WHERE p.ticket_id = t.id AND NOT p.is_outsourced))
             || CASE WHEN v_show_price
                     THEN jsonb_build_object('final_price', t.final_price, 'refunded_amount', t.refunded_amount)
                     ELSE '{}'::jsonb END
        INTO v_case
        FROM repair_tickets t LEFT JOIN repair_records rr ON rr.ticket_id = t.id
       WHERE t.id = r.id;
      v_recent := v_recent || jsonb_build_array(v_case);
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  -- parts used across the cases (이력일 뿐 호환 판정 아님 — P4)
  BEGIN
    SELECT coalesce(jsonb_agg(x ORDER BY x.times DESC, x.category, x.product), '[]'::jsonb) INTO v_parts
      FROM (SELECT p.category_name AS category, p.spec_name AS spec, p.product_name AS product, p.capacity,
                   count(DISTINCT p.ticket_id)::integer AS times, sum(p.quantity)::integer AS quantity
              FROM repair_parts_used p
             WHERE p.ticket_id = ANY (v_case_ids) AND NOT p.is_outsourced
             GROUP BY 1, 2, 3, 4
             ORDER BY 5 DESC, 1, 3
             LIMIT 20) x;
  EXCEPTION WHEN OTHERS THEN
    v_parts := '[]'::jsonb;
    v_skipped := v_skipped + 1;
  END;

  SELECT count(DISTINCT s.part_spec_id)::integer INTO v_in_stock
    FROM search_parts_for_device(v_model, p_variant_id, p_board_id) s
   WHERE s.rank <= 2 AND s.stock_qty > 0;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'donor_id', d.id, 'donor_no', d.donor_no, 'storage_note', d.storage_note,
           'candidates', (SELECT count(*) FROM donor_part_candidates pc
                           WHERE pc.donor_id = d.id AND pc.status IN ('AVAILABLE', 'REQUESTED')))
           ORDER BY d.donor_no), '[]'::jsonb)
    INTO v_donors
    FROM donor_devices d
   WHERE d.status = 'AVAILABLE'
     AND ((v_model IS NOT NULL AND d.catalog_model_id = v_model
           AND (p_variant_id IS NULL OR d.catalog_variant_id IS NULL OR d.catalog_variant_id = p_variant_id))
          OR (p_board_id IS NOT NULL AND d.catalog_board_id = p_board_id));

  RETURN jsonb_build_object(
    'label', v_label,
    'boards', v_boards,
    'notes', v_notes,
    'cases', jsonb_build_object('total', v_total, 'by_result', v_by_result, 'by_status', v_by_status,
                                'recent', v_recent, 'skipped', v_skipped),
    'parts_used', v_parts,
    'compatible_in_stock', v_in_stock,
    'donors', v_donors,
    'show_price', v_show_price);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.get_device_knowledge(uuid,uuid,uuid,uuid) TO anon;

-- label_lookup: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
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

-- model_note_stamp: trigger function — grant only (direct calls are refused by Postgres)
GRANT EXECUTE ON FUNCTION public.model_note_stamp() TO anon, authenticated;

-- part_set_updated_at: trigger function — grant only (direct calls are refused by Postgres)
GRANT EXECUTE ON FUNCTION public.part_set_updated_at() TO anon, authenticated;

-- part_spec_create: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.part_spec_create(p_part_type text, p_name text, p_manufacturer text DEFAULT NULL::text, p_compat_target text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role    employee_role := get_my_role();
  v_norm    text := catalog_normalize(p_name);
  v_target  text := coalesce(NULLIF(btrim(p_compat_target), ''), CASE WHEN p_part_type = 'IC' THEN 'BOARD' ELSE 'MODEL' END);
  v_id      uuid;
  v_existed boolean := false;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF v_role IS NULL OR v_role = 'CS' THEN
    RAISE EXCEPTION '부품 규격 등록 권한이 없습니다.';
  END IF;
  IF p_part_type IS NULL OR p_part_type NOT IN ('PANEL', 'BATTERY', 'KEYBOARD', 'IC', 'STORAGE', 'MEMORY',
                                                'MAINBOARD', 'CABLE', 'FAN', 'CASE', 'ADAPTER', 'OTHER') THEN
    RAISE EXCEPTION '부품 종류를 선택해 주세요.';
  END IF;
  IF v_norm IS NULL THEN
    RAISE EXCEPTION '품번(명칭)을 입력해 주세요.';
  END IF;
  IF char_length(btrim(p_name)) > 150 OR char_length(coalesce(btrim(p_manufacturer), '')) > 50 THEN
    RAISE EXCEPTION '입력이 너무 깁니다. (품번 150자, 제조사 50자 이내)';
  END IF;
  IF v_target NOT IN ('MODEL', 'BOARD') THEN
    RAISE EXCEPTION '호환 기준(모델/보드)이 올바르지 않습니다.';
  END IF;

  SELECT id INTO v_id FROM part_specs WHERE part_type = p_part_type AND name_norm = v_norm;
  IF FOUND THEN
    v_existed := true;
  ELSE
    INSERT INTO part_specs (part_type, name, manufacturer, compat_target, needs_review, created_by)
    VALUES (p_part_type, btrim(p_name), NULLIF(btrim(p_manufacturer), ''), v_target, v_role <> 'ADMIN', auth.uid())
    RETURNING id INTO v_id;
    INSERT INTO part_number_aliases (part_spec_id, alias, alias_type, created_by)
    VALUES (v_id, btrim(p_name), 'PART_NUMBER', auth.uid());
  END IF;

  RETURN jsonb_build_object('part_spec_id', v_id, 'existed', v_existed);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.part_spec_create(text,text,text,text) TO anon;

-- part_spec_search: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.part_spec_search(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(part_spec_id uuid, part_type text, name text, manufacturer text, compat_target text, matched text, score real)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
SELECT public.ri_api_guard_invoker('{anon}');
  WITH q AS (SELECT public.catalog_normalize(p_query) AS n),
  cand AS (
    SELECT s.id AS part_spec_id, s.name AS matched, s.name_norm AS norm FROM part_specs s
    UNION ALL
    SELECT a.part_spec_id, a.alias, a.alias_norm FROM part_number_aliases a
  ),
  scored AS (
    SELECT c.part_spec_id, c.matched,
           (CASE WHEN c.norm = q.n THEN 1.0
                 WHEN c.norm LIKE q.n || '%' THEN 0.9
                 WHEN c.norm LIKE '%' || q.n || '%' THEN 0.8
                 ELSE similarity(c.norm, q.n) END)::real AS score
      FROM cand c, q
     WHERE q.n IS NOT NULL
       AND (c.norm LIKE '%' || q.n || '%' OR similarity(c.norm, q.n) >= 0.2)
  ),
  best AS (
    SELECT DISTINCT ON (s.part_spec_id) s.* FROM scored s ORDER BY s.part_spec_id, s.score DESC
  )
  SELECT b.part_spec_id, ps.part_type, ps.name, ps.manufacturer, ps.compat_target, b.matched, b.score
    FROM best b JOIN part_specs ps ON ps.id = b.part_spec_id
   ORDER BY b.score DESC, ps.name
   LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
$function$;
GRANT EXECUTE ON FUNCTION public.part_spec_search(text,integer) TO anon;

-- purchase_guard_check: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.purchase_guard_check(p_material_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_info      record;
  v_enabled   boolean;
  v_resources jsonb := '[]'::jsonb;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.purchase_guard_check(uuid) TO anon;

-- record_compatibility_result: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.record_compatibility_result(p_part_spec_id uuid, p_target_type text, p_target_id uuid, p_kind text, p_observed_status text, p_limitation_note text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_compat_id   uuid;
  v_evidence_id uuid;
  v_row         part_compatibility;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '호환성 근거 등록은 관리자만 할 수 있습니다.';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('INSTALL', 'DOCUMENT', 'INFERENCE', 'OVERRIDE') THEN
    RAISE EXCEPTION '근거 종류를 선택해 주세요.';
  END IF;
  IF p_observed_status IS NULL OR p_observed_status NOT IN ('compatible', 'conditional', 'incompatible') THEN
    RAISE EXCEPTION '호환 여부(호환/조건부/비호환)를 선택해 주세요.';
  END IF;
  IF p_observed_status = 'conditional' AND NULLIF(btrim(p_limitation_note), '') IS NULL THEN
    RAISE EXCEPTION '조건부는 제한사항을 입력해 주세요.';
  END IF;
  IF p_kind = 'DOCUMENT' AND NULLIF(btrim(p_reference), '') IS NULL THEN
    RAISE EXCEPTION '문서 근거는 출처(문서명 또는 URL)를 입력해 주세요.';
  END IF;
  IF p_kind = 'OVERRIDE' AND NULLIF(btrim(p_note), '') IS NULL THEN
    RAISE EXCEPTION '관리자 조정 사유를 입력해 주세요.';
  END IF;

  v_compat_id := ri_compatibility_row(p_part_spec_id, p_target_type, p_target_id);

  INSERT INTO compatibility_evidence (compatibility_id, kind, observed_status, limitation_note, reference, note, created_by)
  VALUES (v_compat_id, p_kind, p_observed_status,
          CASE WHEN p_observed_status = 'conditional' OR p_kind = 'OVERRIDE' THEN NULLIF(btrim(p_limitation_note), '') END,
          NULLIF(btrim(p_reference), ''), NULLIF(btrim(p_note), ''), auth.uid())
  RETURNING id INTO v_evidence_id;

  PERFORM ri_recompute_compatibility(v_compat_id);
  SELECT * INTO v_row FROM part_compatibility WHERE id = v_compat_id;
  RETURN jsonb_build_object('compatibility_id', v_compat_id, 'evidence_id', v_evidence_id,
                            'status', v_row.status, 'confidence', v_row.confidence);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.record_compatibility_result(uuid,text,uuid,text,text,text,text,text) TO anon;

-- record_part_install_result: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.record_part_install_result(p_material_id uuid, p_part_spec_id uuid, p_answer text, p_limitation_note text DEFAULT NULL::text, p_target_type text DEFAULT NULL::text, p_target_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket_id     uuid;
  v_status        material_request_status;
  v_cat           text;
  v_spec          text;
  v_model_id      uuid;
  v_variant_id    uuid;
  v_board_id      uuid;
  v_compat_target text;
  v_target_type   text;
  v_target_id     uuid;
  v_old_compat    uuid;
  v_compat_id     uuid;
  v_evidence_id   uuid;
  v_row           part_compatibility;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  SELECT m.ticket_id, m.request_status, c.name, s.name
    INTO v_ticket_id, v_status, v_cat, v_spec
    FROM ticket_materials m
    JOIN inventory_items i ON i.id = m.inventory_item_id
    JOIN inventory_categories c ON c.id = i.category_id
    JOIN inventory_specs s ON s.id = i.spec_id
   WHERE m.id = p_material_id
     FOR UPDATE OF m;
  IF NOT FOUND THEN
    RAISE EXCEPTION '자재 내역을 찾을 수 없습니다.';
  END IF;
  IF NOT repair_record_can_edit(v_ticket_id) THEN
    RAISE EXCEPTION '수정 권한이 없습니다. (승인·취소된 접수건의 수리 기록은 관리자만 수정할 수 있습니다)';
  END IF;
  IF v_status NOT IN ('approved', 'cancel_requested') THEN
    RAISE EXCEPTION '승인된 자재만 호환 확인을 기록할 수 있습니다.';
  END IF;
  IF v_spec = '외주' OR v_cat = '소프트웨어' THEN
    RAISE EXCEPTION '외주·소프트웨어 항목은 호환 확인 대상이 아닙니다.';
  END IF;
  IF p_answer IS NULL OR p_answer NOT IN ('OK', 'CONDITIONAL', 'INCOMPATIBLE', 'UNKNOWN') THEN
    RAISE EXCEPTION '호환 확인 결과를 선택해 주세요.';
  END IF;

  -- 판단불가가 아니면 새 근거를 만들 수 있는지 먼저 확인한다 (이전 응답을 철회하기 전에)
  IF p_answer <> 'UNKNOWN' THEN
    IF p_answer = 'CONDITIONAL' AND NULLIF(btrim(p_limitation_note), '') IS NULL THEN
      RAISE EXCEPTION '조건부는 제한사항을 입력해 주세요.';
    END IF;
    SELECT compat_target INTO v_compat_target FROM part_specs WHERE id = p_part_spec_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '부품 규격을 선택해 주세요.';
    END IF;

    -- 접수건에 연결된 표준 모델/보드가 있으면 그것이 대상이다 (매개변수 무시)
    SELECT catalog_model_id, catalog_variant_id, catalog_board_id INTO v_model_id, v_variant_id, v_board_id
      FROM repair_tickets WHERE id = v_ticket_id;
    IF v_compat_target = 'BOARD' AND v_board_id IS NOT NULL THEN
      v_target_type := 'BOARD';   v_target_id := v_board_id;
    ELSIF v_compat_target = 'MODEL' AND v_variant_id IS NOT NULL THEN
      v_target_type := 'VARIANT'; v_target_id := v_variant_id;
    ELSIF v_compat_target = 'MODEL' AND v_model_id IS NOT NULL THEN
      v_target_type := 'MODEL';   v_target_id := v_model_id;
    ELSIF p_target_id IS NOT NULL THEN
      v_target_type := p_target_type; v_target_id := p_target_id;
    ELSE
      RAISE EXCEPTION '접수건에 연결된 % 정보가 없습니다. 대상을 선택해 주세요.',
        CASE v_compat_target WHEN 'BOARD' THEN '메인보드' ELSE '표준 모델' END;
    END IF;
    v_compat_id := ri_compatibility_row(p_part_spec_id, v_target_type, v_target_id);
  END IF;

  -- 이 자재의 이전 응답은 철회 (이력은 남는다)
  UPDATE compatibility_evidence
     SET retracted_at = now(), retracted_by = auth.uid(), retract_reason = '응답 변경'
   WHERE ticket_material_id = p_material_id AND retracted_at IS NULL
  RETURNING compatibility_id INTO v_old_compat;

  IF p_answer <> 'UNKNOWN' THEN
    INSERT INTO compatibility_evidence (compatibility_id, kind, observed_status, limitation_note, ticket_id, ticket_material_id, created_by)
    VALUES (v_compat_id, 'INSTALL',
            CASE p_answer WHEN 'OK' THEN 'compatible' WHEN 'CONDITIONAL' THEN 'conditional' ELSE 'incompatible' END,
            CASE WHEN p_answer = 'CONDITIONAL' THEN btrim(p_limitation_note) END,
            v_ticket_id, p_material_id, auth.uid())
    RETURNING id INTO v_evidence_id;
    PERFORM ri_recompute_compatibility(v_compat_id);
    SELECT * INTO v_row FROM part_compatibility WHERE id = v_compat_id;
  END IF;

  IF v_old_compat IS NOT NULL AND v_old_compat IS DISTINCT FROM v_compat_id THEN
    PERFORM ri_recompute_compatibility(v_old_compat);
  END IF;

  RETURN jsonb_build_object('ticket_id', v_ticket_id, 'compatibility_id', v_compat_id, 'evidence_id', v_evidence_id,
                            'status', v_row.status, 'confidence', v_row.confidence);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.record_part_install_result(uuid,uuid,text,text,text,uuid) TO anon;

-- register_return_material: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.register_return_material(p_material_id uuid, p_category_id uuid, p_spec text, p_name text, p_condition text, p_quantity integer DEFAULT 1, p_capacity text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  PERFORM public.ri_api_guard_definer('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.register_return_material(uuid,uuid,text,text,text,integer,text) TO anon;

-- repair_gate_check: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.repair_gate_check(p_ticket_id uuid, p_gate text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_received  timestamptz;
  v_rec       repair_records;
  v_missing   text[] := '{}';
  v_undecided integer;
BEGIN
  PERFORM public.ri_api_guard_invoker('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.repair_gate_check(uuid,text) TO anon;

-- repair_gate_override: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.repair_gate_override(p_ticket_id uuid, p_gate text, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_check jsonb;
  v_id    uuid;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.repair_gate_override(uuid,text,text) TO anon;

-- repair_record_can_edit: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.repair_record_can_edit(p_ticket_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role     employee_role := get_my_role();
  v_status   ticket_status;
  v_approved boolean;
  v_assignee uuid;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.repair_record_can_edit(uuid) TO anon;

-- repair_removed_part_stamp: trigger function — grant only (direct calls are refused by Postgres)
GRANT EXECUTE ON FUNCTION public.repair_removed_part_stamp() TO anon, authenticated;

-- repair_set_cancel_result: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.repair_set_cancel_result(p_ticket_id uuid, p_result text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role     employee_role := get_my_role();
  v_status   ticket_status;
  v_assignee uuid;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.repair_set_cancel_result(uuid,text) TO anon;

-- repair_set_updated_at: trigger function — grant only (direct calls are refused by Postgres)
GRANT EXECUTE ON FUNCTION public.repair_set_updated_at() TO anon, authenticated;

-- request_purchase_material: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.request_purchase_material(p_material_id uuid, p_reason_code text DEFAULT NULL::text, p_reason_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_info      record;
  v_enabled   boolean;
  v_resources jsonb;
  v_count     integer;
  v_code      text := nullif(btrim(p_reason_code), '');
  v_note      text := nullif(btrim(p_reason_note), '');
  v_log_id    uuid;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.request_purchase_material(uuid,text,text) TO anon;

-- retract_compatibility_evidence: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.retract_compatibility_evidence(p_evidence_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_compat_id uuid;
  v_row       part_compatibility;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '근거 철회는 관리자만 할 수 있습니다.';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION '철회 사유를 입력해 주세요.';
  END IF;

  UPDATE compatibility_evidence
     SET retracted_at = now(), retracted_by = auth.uid(), retract_reason = btrim(p_reason)
   WHERE id = p_evidence_id AND retracted_at IS NULL
  RETURNING compatibility_id INTO v_compat_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '근거를 찾을 수 없거나 이미 철회되었습니다.';
  END IF;

  PERFORM ri_recompute_compatibility(v_compat_id);
  SELECT * INTO v_row FROM part_compatibility WHERE id = v_compat_id;
  RETURN jsonb_build_object('compatibility_id', v_compat_id, 'status', v_row.status, 'confidence', v_row.confidence);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.retract_compatibility_evidence(uuid,text) TO anon;

-- ri_compatibility_row: guard denies {anon,authenticated,service_role} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.ri_compatibility_row(p_part_spec_id uuid, p_target_type text, p_target_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_compat_target text;
  v_id            uuid;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon,authenticated,service_role}');
  SELECT compat_target INTO v_compat_target FROM part_specs WHERE id = p_part_spec_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '부품 규격을 찾을 수 없습니다.';
  END IF;
  IF p_target_id IS NULL OR p_target_type IS NULL OR p_target_type NOT IN ('MODEL', 'VARIANT', 'BOARD') THEN
    RAISE EXCEPTION '호환 대상(모델/변형/보드)을 선택해 주세요.';
  END IF;
  IF (v_compat_target = 'BOARD') <> (p_target_type = 'BOARD') THEN
    RAISE EXCEPTION '이 부품 규격의 호환 기준은 %입니다.', CASE v_compat_target WHEN 'BOARD' THEN '메인보드' ELSE '모델/변형' END;
  END IF;

  IF p_target_type = 'MODEL' THEN
    IF NOT EXISTS (SELECT 1 FROM catalog_models WHERE id = p_target_id) THEN
      RAISE EXCEPTION '표준 모델을 찾을 수 없습니다.';
    END IF;
    INSERT INTO part_compatibility (part_spec_id, model_id) VALUES (p_part_spec_id, p_target_id)
      ON CONFLICT (part_spec_id, model_id) WHERE model_id IS NOT NULL DO NOTHING;
    SELECT id INTO v_id FROM part_compatibility WHERE part_spec_id = p_part_spec_id AND model_id = p_target_id;
  ELSIF p_target_type = 'VARIANT' THEN
    IF NOT EXISTS (SELECT 1 FROM catalog_variants WHERE id = p_target_id) THEN
      RAISE EXCEPTION '모델 변형을 찾을 수 없습니다.';
    END IF;
    INSERT INTO part_compatibility (part_spec_id, variant_id) VALUES (p_part_spec_id, p_target_id)
      ON CONFLICT (part_spec_id, variant_id) WHERE variant_id IS NOT NULL DO NOTHING;
    SELECT id INTO v_id FROM part_compatibility WHERE part_spec_id = p_part_spec_id AND variant_id = p_target_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM catalog_boards WHERE id = p_target_id) THEN
      RAISE EXCEPTION '메인보드를 찾을 수 없습니다.';
    END IF;
    INSERT INTO part_compatibility (part_spec_id, board_id) VALUES (p_part_spec_id, p_target_id)
      ON CONFLICT (part_spec_id, board_id) WHERE board_id IS NOT NULL DO NOTHING;
    SELECT id INTO v_id FROM part_compatibility WHERE part_spec_id = p_part_spec_id AND board_id = p_target_id;
  END IF;

  RETURN v_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.ri_compatibility_row(uuid,text,uuid) TO anon, authenticated, service_role;

-- ri_inbound_extracted_part: guard denies {anon,authenticated,service_role} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.ri_inbound_extracted_part(p_category_id uuid, p_spec text, p_name text, p_capacity text, p_quantity integer, p_ticket_id uuid, p_tx_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_capacity   text := NULLIF(btrim(p_capacity), '');
  v_spec_id    uuid;
  v_product_id uuid;
  v_item_id    uuid;
  v_first_id   uuid;
BEGIN
  PERFORM public.ri_api_guard_invoker('{anon,authenticated,service_role}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.ri_inbound_extracted_part(uuid,text,text,text,integer,uuid,uuid) TO anon, authenticated, service_role;

-- ri_next_item_label: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.ri_next_item_label()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_n bigint := nextval('public.inventory_label_seq');
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  RETURN 'P-' || CASE WHEN v_n < 100000 THEN lpad(v_n::text, 5, '0') ELSE v_n::text END;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.ri_next_item_label() TO anon;

-- ri_purchase_guard_enforce: trigger function — grant only (direct calls are refused by Postgres)
GRANT EXECUTE ON FUNCTION public.ri_purchase_guard_enforce() TO anon, authenticated;

-- ri_purchase_material_info: guard denies {anon,authenticated} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.ri_purchase_material_info(p_material_id uuid, p_lock boolean DEFAULT false)
 RETURNS TABLE(material_id uuid, ticket_id uuid, request_type text, request_status text, quantity integer, item_label text, outsourced boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role     employee_role := get_my_role();
  v_assignee uuid;
BEGIN
  PERFORM public.ri_api_guard_invoker('{anon,authenticated}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.ri_purchase_material_info(uuid,boolean) TO anon, authenticated;

-- ri_purchase_resources: guard denies {anon,authenticated} (= roles without EXECUTE before Phase 0.6)
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

-- ri_recompute_compatibility: guard denies {anon,authenticated,service_role} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.ri_recompute_compatibility(p_compatibility_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tier       text;
  v_confidence text;
  v_status     text;
  v_note       text;
  v_override   compatibility_evidence;
  v_ok         integer;
  v_cond       integer;
  v_inc        integer;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon,authenticated,service_role}');
  -- 신뢰도: OVERRIDE를 제외한 유효 근거 중 가장 높은 등급 (verified는 실장 확인으로만)
  SELECT CASE WHEN bool_or(kind = 'INSTALL') THEN 'INSTALL'
              WHEN bool_or(kind = 'DOCUMENT') THEN 'DOCUMENT'
              WHEN bool_or(kind = 'INFERENCE') THEN 'INFERENCE' END
    INTO v_tier
    FROM compatibility_evidence
   WHERE compatibility_id = p_compatibility_id AND retracted_at IS NULL AND kind <> 'OVERRIDE';
  v_confidence := CASE v_tier WHEN 'INSTALL' THEN 'verified' WHEN 'DOCUMENT' THEN 'documented' ELSE 'inferred' END;

  SELECT * INTO v_override
    FROM compatibility_evidence
   WHERE compatibility_id = p_compatibility_id AND retracted_at IS NULL AND kind = 'OVERRIDE'
   ORDER BY created_at DESC, id DESC
   LIMIT 1;

  IF v_override.id IS NOT NULL THEN
    v_status := v_override.observed_status;
    v_note := NULLIF(btrim(v_override.limitation_note), '');
  ELSIF v_tier IS NULL THEN
    v_status := 'unknown';
    v_note := NULL;
  ELSE
    SELECT count(*) FILTER (WHERE observed_status = 'compatible'),
           count(*) FILTER (WHERE observed_status = 'conditional'),
           count(*) FILTER (WHERE observed_status = 'incompatible')
      INTO v_ok, v_cond, v_inc
      FROM compatibility_evidence
     WHERE compatibility_id = p_compatibility_id AND retracted_at IS NULL AND kind = v_tier;

    IF v_inc > 0 AND v_ok + v_cond > 0 THEN
      v_status := 'conditional';
      v_note := format('상반된 결과: 정상 %s건 / 조건부 %s건 / 비호환 %s건 — 근거 확인 필요', v_ok, v_cond, v_inc);
    ELSIF v_inc > 0 THEN
      v_status := 'incompatible';
    ELSIF v_cond > 0 THEN
      v_status := 'conditional';
      SELECT btrim(limitation_note) INTO v_note
        FROM compatibility_evidence
       WHERE compatibility_id = p_compatibility_id AND retracted_at IS NULL AND kind = v_tier AND observed_status = 'conditional'
       ORDER BY created_at DESC, id DESC
       LIMIT 1;
    ELSE
      v_status := 'compatible';
    END IF;
  END IF;

  UPDATE part_compatibility
     SET status = v_status, confidence = v_confidence, limitation_note = v_note, updated_at = now()
   WHERE id = p_compatibility_id;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.ri_recompute_compatibility(uuid) TO anon, authenticated, service_role;

-- search_devices_for_part: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.search_devices_for_part(p_part_spec_id uuid)
 RETURNS TABLE(target_type text, target_id uuid, target_label text, linked_models text, status text, confidence text, limitation_note text, install_ok integer, install_conditional integer, install_incompatible integer, document_count integer, is_candidate boolean, rank integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
SELECT public.ri_api_guard_invoker('{anon}');
  SELECT cs.target_type, cs.target_id, cs.target_label,
         CASE WHEN cs.target_type = 'BOARD' THEN
           (SELECT string_agg(concat_ws(' ', br.name, cm.name, cv.name), ', ' ORDER BY br.name, cm.name, cv.name)
              FROM catalog_model_boards mb
              JOIN catalog_models cm ON cm.id = mb.model_id
              JOIN catalog_brands br ON br.id = cm.brand_id
              LEFT JOIN catalog_variants cv ON cv.id = mb.variant_id
             WHERE mb.board_id = cs.target_id)
         END,
         cs.status, cs.confidence, cs.limitation_note,
         cs.install_ok, cs.install_conditional, cs.install_incompatible, cs.document_count, cs.is_candidate,
         CASE WHEN cs.status = 'incompatible' THEN 9
              WHEN cs.confidence = 'verified'   AND cs.status IN ('compatible', 'conditional') THEN 1
              WHEN cs.confidence = 'documented' AND cs.status IN ('compatible', 'conditional') THEN 2
              ELSE 3 END
    FROM compatibility_summary cs
   WHERE cs.part_spec_id = p_part_spec_id
   ORDER BY 13, cs.target_label;
$function$;
GRANT EXECUTE ON FUNCTION public.search_devices_for_part(uuid) TO anon;

-- search_parts_for_device: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.search_parts_for_device(p_model_id uuid DEFAULT NULL::uuid, p_variant_id uuid DEFAULT NULL::uuid, p_board_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(part_spec_id uuid, part_type text, part_name text, manufacturer text, target_type text, target_id uuid, target_label text, status text, confidence text, limitation_note text, install_ok integer, install_conditional integer, install_incompatible integer, document_count integer, is_candidate boolean, stock_qty bigint, donor_qty bigint, rank integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_model uuid := p_model_id;
BEGIN
  PERFORM public.ri_api_guard_invoker('{anon}');
  IF p_variant_id IS NOT NULL THEN
    SELECT cv.model_id INTO v_model FROM catalog_variants cv
     WHERE cv.id = p_variant_id AND (p_model_id IS NULL OR cv.model_id = p_model_id);
    IF v_model IS NULL THEN
      RAISE EXCEPTION '선택한 변형이 모델에 속하지 않습니다.';
    END IF;
  END IF;
  IF v_model IS NULL AND p_board_id IS NULL THEN
    RAISE EXCEPTION '검색할 모델 또는 보드를 선택해 주세요.';
  END IF;

  RETURN QUERY
  WITH targets AS (
    SELECT 'MODEL'::text AS t_type, v_model AS t_id WHERE v_model IS NOT NULL
    UNION
    SELECT 'VARIANT', cv.id FROM catalog_variants cv
     WHERE cv.model_id = v_model AND (p_variant_id IS NULL OR cv.id = p_variant_id)
    UNION
    SELECT 'BOARD', p_board_id WHERE p_board_id IS NOT NULL
    UNION
    SELECT 'BOARD', mb.board_id FROM catalog_model_boards mb
     WHERE mb.model_id = v_model AND (p_variant_id IS NULL OR mb.variant_id IS NULL OR mb.variant_id = p_variant_id)
  ),
  stock AS (
    SELECT i.part_spec_id AS sid, sum(i.quantity)::bigint AS qty
      FROM inventory_items i JOIN inventory_specs s ON s.id = i.spec_id
     WHERE i.part_spec_id IS NOT NULL AND s.name <> '외주'
     GROUP BY i.part_spec_id
  ),
  donor AS (
    SELECT d.part_spec_id AS sid, sum(d.quantity)::bigint AS qty
      FROM donor_potential_stock d WHERE d.part_spec_id IS NOT NULL
     GROUP BY d.part_spec_id
  ),
  res AS (
    SELECT cs.part_spec_id, cs.part_type, cs.part_name, cs.manufacturer, cs.target_type, cs.target_id, cs.target_label,
           cs.status, cs.confidence, cs.limitation_note,
           cs.install_ok, cs.install_conditional, cs.install_incompatible, cs.document_count, cs.is_candidate,
           coalesce(st.qty, 0) AS stock_qty, coalesce(dn.qty, 0) AS donor_qty,
           CASE WHEN cs.status = 'incompatible' THEN 9
                WHEN cs.confidence = 'verified'   AND cs.status IN ('compatible', 'conditional') THEN 1
                WHEN cs.confidence = 'documented' AND cs.status IN ('compatible', 'conditional') THEN 2
                ELSE 3 END AS rank
      FROM compatibility_summary cs
      JOIN targets t ON t.t_type = cs.target_type AND t.t_id = cs.target_id
      LEFT JOIN stock st ON st.sid = cs.part_spec_id
      LEFT JOIN donor dn ON dn.sid = cs.part_spec_id
  )
  SELECT r.part_spec_id, r.part_type, r.part_name, r.manufacturer, r.target_type, r.target_id, r.target_label,
         r.status, r.confidence, r.limitation_note,
         r.install_ok, r.install_conditional, r.install_incompatible, r.document_count, r.is_candidate,
         r.stock_qty, r.donor_qty, r.rank
    FROM res r
   ORDER BY r.rank, (r.stock_qty > 0) DESC, (r.donor_qty > 0) DESC, r.part_name, r.target_label;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.search_parts_for_device(uuid,uuid,uuid) TO anon;

-- set_storage_location: guard denies {anon} (= roles without EXECUTE before Phase 0.6)
CREATE OR REPLACE FUNCTION public.set_storage_location(p_kind text, p_id uuid, p_location_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role   employee_role := get_my_role();
  v_active boolean;
  v_code   text;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
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
$function$;
GRANT EXECUTE ON FUNCTION public.set_storage_location(text,uuid,uuid) TO anon;
