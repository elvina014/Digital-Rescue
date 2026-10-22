-- =============================================================
-- 완료(승인)된 접수건의 수동 추가 비용 등록/수정 — ADMIN/MANAGER 전용
-- A/S 요청, 누락 비용의 사후 입력용. 통계는 repair_tickets.material_cost(완료월 귀속)로 반영된다.
--
-- 배경: protect_approved_ticket 트리거는 KI-9(current_role 키워드 충돌) 때문에 ADMIN/MANAGER도
-- 승인건 UPDATE를 막는다. 트리거는 건드리지 않고, recalc_ticket_material_cost와 같은
-- app.refund_sync 트랜잭션 GUC로 material_cost_details 변경만 통과시킨다. 역할 확인은 함수 내부(R10).
-- Adds: public.add_ticket_manual_cost, public.update_ticket_manual_cost
-- Rollback SQL: supabase/test-fixtures/completed-manual-cost/rollback.sql
-- =============================================================

-- ---------- 1. 완료 건에 수동 비용 항목 추가 ----------
CREATE OR REPLACE FUNCTION public.add_ticket_manual_cost(
  p_ticket_id uuid,
  p_description text,
  p_amount integer
) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role    employee_role;
  v_status  ticket_status;
  v_details jsonb;
BEGIN
  v_role := get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'MANAGER') THEN
    RAISE EXCEPTION '완료 건의 추가 비용은 관리자/팀장만 등록할 수 있습니다.';
  END IF;

  IF p_description IS NULL OR btrim(p_description) = '' OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '비용 내용과 유효한 금액을 입력해 주세요.';
  END IF;

  SELECT status, CASE WHEN jsonb_typeof(material_cost_details) = 'array'
                      THEN material_cost_details ELSE '[]'::jsonb END
    INTO v_status, v_details
  FROM repair_tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '접수건을 찾을 수 없습니다.';
  END IF;
  IF v_status <> 'COMPLETED' THEN
    RAISE EXCEPTION '수리 완료된 접수건만 사후 비용을 추가할 수 있습니다.';
  END IF;

  PERFORM set_config('app.refund_sync', 'on', true);
  UPDATE repair_tickets
  SET material_cost_details = v_details || jsonb_build_array(
        jsonb_build_object('description', btrim(p_description), 'amount', p_amount))
  WHERE id = p_ticket_id;
  PERFORM set_config('app.refund_sync', 'off', true);

  RETURN recalc_ticket_material_cost(p_ticket_id);
END;
$$;

-- ---------- 2. 수동 비용 항목 수정 (상태 무관, 승인건 포함) ----------
CREATE OR REPLACE FUNCTION public.update_ticket_manual_cost(
  p_ticket_id uuid,
  p_index integer,
  p_description text,
  p_amount integer
) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role    employee_role;
  v_details jsonb;
BEGIN
  v_role := get_my_role();
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'MANAGER') THEN
    RAISE EXCEPTION '수동 추가 비용을 수정할 권한이 없습니다.';
  END IF;

  IF p_description IS NULL OR btrim(p_description) = '' OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '비용 내용과 유효한 금액을 입력해 주세요.';
  END IF;

  SELECT CASE WHEN jsonb_typeof(material_cost_details) = 'array'
              THEN material_cost_details ELSE '[]'::jsonb END
    INTO v_details
  FROM repair_tickets
  WHERE id = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '접수건을 찾을 수 없습니다.';
  END IF;
  IF p_index IS NULL OR p_index < 0 OR p_index >= jsonb_array_length(v_details) THEN
    RAISE EXCEPTION '해당 비용 항목을 찾을 수 없습니다.';
  END IF;

  PERFORM set_config('app.refund_sync', 'on', true);
  UPDATE repair_tickets
  SET material_cost_details = jsonb_set(
        v_details, ARRAY[p_index::text],
        (v_details -> p_index)
          || jsonb_build_object('description', btrim(p_description), 'amount', p_amount))
  WHERE id = p_ticket_id;
  PERFORM set_config('app.refund_sync', 'off', true);

  RETURN recalc_ticket_material_cost(p_ticket_id);
END;
$$;

-- ---------- 3. function privileges (R10: exposed schema → hint roles get EXECUTE, refusal inside) ----------
REVOKE ALL ON FUNCTION public.add_ticket_manual_cost(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_ticket_manual_cost(uuid, text, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_ticket_manual_cost(uuid, integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_ticket_manual_cost(uuid, integer, text, integer) TO anon, authenticated, service_role;
