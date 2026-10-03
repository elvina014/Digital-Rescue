-- =============================================================
-- Phase 5 — Search & intake pre-check (부품·기기 검색 · 접수 사전 확인)
-- Plan: docs/repair-intelligence/phases/phase-5-plan.md (APPROVED 2026-10-03)
--
-- One new table (model_notes) and three read functions.
-- No existing table column, trigger, function, policy or view is changed.
-- Existing objects are only read: compatibility_summary, donor_potential_stock, repair_parts_used, catalog_*, part_specs.
-- Rollback SQL: see the plan §5 / phase-5-report.md.
-- =============================================================

-- ---------- 1. table: model_notes ----------
CREATE FUNCTION public.model_note_stamp() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

CREATE TABLE public.model_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id   uuid REFERENCES public.catalog_models(id) ON DELETE RESTRICT,
  variant_id uuid,
  board_id   uuid REFERENCES public.catalog_boards(id) ON DELETE RESTRICT,
  note_type  text NOT NULL DEFAULT 'TIP' CHECK (note_type IN ('CAUTION', 'KNOWN_ISSUE', 'TIP', 'PARTS')),
  body       text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 1000),
  is_pinned  boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT model_notes_one_target CHECK (num_nonnulls(model_id, board_id) = 1),
  CONSTRAINT model_notes_variant_needs_model CHECK (variant_id IS NULL OR model_id IS NOT NULL),
  CONSTRAINT model_notes_variant_fk FOREIGN KEY (variant_id, model_id)
    REFERENCES public.catalog_variants(id, model_id) ON DELETE RESTRICT
);
COMMENT ON TABLE public.model_notes IS '모델/보드 메모 (주의, 고질 고장, 작업 팁, 부품 정보) — 전 직원 조회';
COMMENT ON COLUMN public.model_notes.note_type IS 'CAUTION 주의 / KNOWN_ISSUE 고질 고장 / TIP 작업 팁 / PARTS 부품 정보';
CREATE INDEX model_notes_model_idx      ON public.model_notes (model_id);
CREATE INDEX model_notes_variant_idx    ON public.model_notes (variant_id, model_id);
CREATE INDEX model_notes_board_idx      ON public.model_notes (board_id);
CREATE INDEX model_notes_created_by_idx ON public.model_notes (created_by);
CREATE INDEX model_notes_updated_by_idx ON public.model_notes (updated_by);
CREATE TRIGGER trg_model_notes_stamp BEFORE UPDATE ON public.model_notes
  FOR EACH ROW EXECUTE FUNCTION public.model_note_stamp();

-- ---------- 2. RLS ----------
ALTER TABLE public.model_notes ENABLE ROW LEVEL SECURITY;

-- 전 직원 조회; 작성은 관리자/팀장/기사/정밀수리팀 (본인 명의); 수정·삭제는 관리자/팀장 또는 작성자
CREATE POLICY model_notes_select ON public.model_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY model_notes_insert ON public.model_notes FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role,
                                                'TECHNICIAN'::public.employee_role, 'EXPERT_REPAIR'::public.employee_role])
              AND created_by = (SELECT auth.uid()));
CREATE POLICY model_notes_update ON public.model_notes FOR UPDATE TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role])
         OR (created_by = (SELECT auth.uid())
             AND public.get_my_role() = ANY (ARRAY['TECHNICIAN'::public.employee_role, 'EXPERT_REPAIR'::public.employee_role])))
  WITH CHECK (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role])
              OR (created_by = (SELECT auth.uid())
                  AND public.get_my_role() = ANY (ARRAY['TECHNICIAN'::public.employee_role, 'EXPERT_REPAIR'::public.employee_role])));
CREATE POLICY model_notes_delete ON public.model_notes FOR DELETE TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role])
         OR (created_by = (SELECT auth.uid())
             AND public.get_my_role() = ANY (ARRAY['TECHNICIAN'::public.employee_role, 'EXPERT_REPAIR'::public.employee_role])));
REVOKE ALL ON public.model_notes FROM anon;
REVOKE INSERT, UPDATE, TRUNCATE ON public.model_notes FROM authenticated;
GRANT INSERT (model_id, variant_id, board_id, note_type, body, is_pinned) ON public.model_notes TO authenticated;
GRANT UPDATE (model_id, variant_id, board_id, note_type, body, is_pinned) ON public.model_notes TO authenticated;

-- ---------- 3. device → parts (호출자 권한) ----------
-- rank (P9): 1 verified 호환/조건부, 2 documented 호환/조건부, 3 추정·미확인, 9 비호환
CREATE FUNCTION public.search_parts_for_device(p_model_id uuid DEFAULT NULL, p_variant_id uuid DEFAULT NULL,
                                               p_board_id uuid DEFAULT NULL)
RETURNS TABLE (part_spec_id uuid, part_type text, part_name text, manufacturer text,
               target_type text, target_id uuid, target_label text,
               status text, confidence text, limitation_note text,
               install_ok integer, install_conditional integer, install_incompatible integer, document_count integer,
               is_candidate boolean, stock_qty bigint, donor_qty bigint, rank integer)
  LANGUAGE plpgsql STABLE
  SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_model uuid := p_model_id;
BEGIN
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
$$;
COMMENT ON FUNCTION public.search_parts_for_device(uuid, uuid, uuid) IS
  '기기 → 부품: 모델/변형/보드(+모델 연결 보드)에 대한 호환 부품, 재고·Donor 수량 (외주 제외, 가격 없음), P9 순위';

-- ---------- 4. part → devices (호출자 권한) ----------
CREATE FUNCTION public.search_devices_for_part(p_part_spec_id uuid)
RETURNS TABLE (target_type text, target_id uuid, target_label text, linked_models text,
               status text, confidence text, limitation_note text,
               install_ok integer, install_conditional integer, install_incompatible integer, document_count integer,
               is_candidate boolean, rank integer)
  LANGUAGE sql STABLE
  SET search_path = public
AS $$
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
$$;
COMMENT ON FUNCTION public.search_devices_for_part(uuid) IS
  '부품 → 기기: 부품 규격의 호환 대상(모델/변형/보드, 보드는 연결 모델 포함), P9 순위';

-- ---------- 5. intake / ticket panel (definer: 사례는 배정과 무관하게 전 직원 조회 — Q7, 고객 정보 없음) ----------
CREATE FUNCTION public.get_device_knowledge(p_model_id uuid DEFAULT NULL, p_variant_id uuid DEFAULT NULL,
                                            p_board_id uuid DEFAULT NULL, p_exclude_ticket_id uuid DEFAULT NULL)
RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
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
$$;
COMMENT ON FUNCTION public.get_device_knowledge(uuid, uuid, uuid, uuid) IS
  '접수 사전 확인: 메모, 과거 사례(접수번호만, 고객 정보 없음; 금액은 관리자/팀장만), 사용 부품 이력, 호환 재고 수, 같은 모델 Donor';

-- ---------- 6. function privileges ----------
REVOKE ALL ON FUNCTION public.model_note_stamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_parts_for_device(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.search_devices_for_part(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_device_knowledge(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_parts_for_device(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_devices_for_part(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_device_knowledge(uuid, uuid, uuid, uuid) TO authenticated;
