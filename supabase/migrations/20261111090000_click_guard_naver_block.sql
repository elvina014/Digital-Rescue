-- =============================================================
-- Click Guard 확장 — ERP에서 네이버 광고노출 제한 IP 등록/해제 (docs/click-guard/NAVER-API.md)
--
-- 네이버 API 호출은 ERP 서버 액션이 한다. 이 마이그레이션은 그 결과를 기록하는 DB 쪽만 추가한다.
-- 함수 권한은 R10/KI-8 패턴(2026-11-11 Brad 승인 결정 2): EXECUTE는 hint_roles에 두고 함수 안에서 ADMIN이 아니면 거부한다.
-- Adds: columns public.cg_ip_marks.naver_filter_id / naver_registered_at / naver_source
--       table   public.cg_block_log
--       functions public.cg_mark_naver_registered, public.cg_mark_naver_unregistered, public.cg_log_block
-- Backfill: 기존 '네이버 등록완료' 표시 행의 naver_source 를 'manual' 로 채운다 (status·memo 는 건드리지 않는다).
-- Rollback SQL: supabase/test-fixtures/click-guard/rollback-naver-block.sql
-- =============================================================

-- ---------- 1. cg_ip_marks: 네이버 등록 정보 ----------
ALTER TABLE public.cg_ip_marks
  ADD COLUMN naver_filter_id     text,
  ADD COLUMN naver_registered_at timestamptz,
  ADD COLUMN naver_source        text CHECK (naver_source IN ('api', 'manual'));

COMMENT ON COLUMN public.cg_ip_marks.naver_filter_id IS '네이버 광고노출 제한 항목 ID(ipFilterId). API로 등록했거나 목록에서 찾은 경우에만 있다';
COMMENT ON COLUMN public.cg_ip_marks.naver_source IS 'api = ERP가 네이버 API로 등록([CG] 메모), manual = 사람이 검색광고센터에서 직접 등록';

-- 기존 '등록 완료 표시' 행은 사람이 직접 등록한 것이다
UPDATE public.cg_ip_marks SET naver_source = 'manual' WHERE status = 'naver_blocked' AND naver_source IS NULL;

-- ---------- 2. 차단 등록/해제 감사 로그 (추가만, 수정·삭제 정책 없음) ----------
CREATE TABLE public.cg_block_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at      timestamptz NOT NULL DEFAULT now(),
  client_ip       inet,
  action          text NOT NULL CHECK (action IN ('register', 'unregister', 'sync')),
  result          text NOT NULL CHECK (result IN ('success', 'fail', 'skipped')),
  naver_filter_id text,
  actor           uuid,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX cg_block_log_ip_idx ON public.cg_block_log (client_ip, created_at DESC);

ALTER TABLE public.cg_block_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY cg_block_log_select ON public.cg_block_log FOR SELECT TO authenticated
  USING (public.get_my_role() = 'ADMIN'::public.employee_role);

REVOKE ALL ON public.cg_block_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.cg_block_log FROM authenticated;

COMMENT ON TABLE public.cg_block_log IS 'Click Guard: 네이버 광고노출 제한 등록/해제/현황 확인 감사 로그. cg_log_block 으로만 추가한다';

-- ---------- 3. 네이버 등록 완료 기록 ----------
-- p_source = 'api'    : ERP가 API로 등록했거나, 네이버 목록에서 [CG] 항목을 찾아 ERP 표시를 맞춘 경우
-- p_source = 'manual' : 사람이 검색광고센터에서 직접 등록한 경우 (수동 표시 버튼, 목록에서 수동 항목 발견)
-- p_memo 가 비어 있으면 기존 메모를 유지한다.
CREATE FUNCTION public.cg_mark_naver_registered(
  p_ip inet, p_filter_id text, p_memo text DEFAULT NULL, p_source text DEFAULT 'api'
) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_memo      text := NULLIF(btrim(p_memo), '');
  v_filter_id text := NULLIF(btrim(p_filter_id), '');
  v_row       cg_ip_marks;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '부정클릭 감시는 관리자만 이용할 수 있습니다.';
  END IF;
  IF p_ip IS NULL THEN
    RAISE EXCEPTION 'IP가 없습니다.';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('api', 'manual') THEN
    RAISE EXCEPTION '등록 구분이 올바르지 않습니다.';
  END IF;
  IF p_source = 'api' AND v_filter_id IS NULL THEN
    RAISE EXCEPTION '네이버 항목 ID가 없습니다.';
  END IF;
  IF char_length(v_memo) > 500 THEN
    RAISE EXCEPTION '메모는 500자 이내로 입력해 주세요.';
  END IF;

  INSERT INTO cg_ip_marks AS m (client_ip, status, memo, marked_by, marked_at, updated_at,
                                naver_filter_id, naver_registered_at, naver_source)
  VALUES (p_ip, 'naver_blocked', v_memo, auth.uid(), now(), now(), v_filter_id, now(), p_source)
  ON CONFLICT (client_ip) DO UPDATE
    SET status = 'naver_blocked', memo = COALESCE(EXCLUDED.memo, m.memo), marked_by = EXCLUDED.marked_by,
        marked_at = now(), updated_at = now(),
        naver_filter_id = EXCLUDED.naver_filter_id, naver_registered_at = now(), naver_source = EXCLUDED.naver_source
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON FUNCTION public.cg_mark_naver_registered(inet, text, text, text) IS
  'Click Guard: 네이버 광고노출 제한 등록 완료 기록(status=naver_blocked, naver_source api/manual). ADMIN 전용(R10)';

-- ---------- 4. 네이버 등록 해제 기록 (표시 행을 지워 미처리로 되돌린다) ----------
CREATE FUNCTION public.cg_mark_naver_unregistered(p_ip inet) RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '부정클릭 감시는 관리자만 이용할 수 있습니다.';
  END IF;
  IF p_ip IS NULL THEN
    RAISE EXCEPTION 'IP가 없습니다.';
  END IF;
  DELETE FROM cg_ip_marks WHERE client_ip = p_ip AND status = 'naver_blocked';
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.cg_mark_naver_unregistered(inet) IS
  'Click Guard: 네이버 등록 해제 기록 — 네이버 등록완료 표시 행을 삭제한다(이력은 cg_block_log). ADMIN 전용(R10)';

-- ---------- 5. 감사 로그 추가 ----------
CREATE FUNCTION public.cg_log_block(
  p_ip inet, p_action text, p_result text, p_filter_id text DEFAULT NULL, p_detail jsonb DEFAULT '{}'::jsonb
) RETURNS bigint
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '부정클릭 감시는 관리자만 이용할 수 있습니다.';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('register', 'unregister', 'sync') THEN
    RAISE EXCEPTION '로그 동작이 올바르지 않습니다.';
  END IF;
  IF p_result IS NULL OR p_result NOT IN ('success', 'fail', 'skipped') THEN
    RAISE EXCEPTION '로그 결과가 올바르지 않습니다.';
  END IF;

  INSERT INTO cg_block_log (client_ip, action, result, naver_filter_id, actor, detail)
  VALUES (p_ip, p_action, p_result, NULLIF(btrim(p_filter_id), ''), auth.uid(), COALESCE(p_detail, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.cg_log_block(inet, text, text, text, jsonb) IS
  'Click Guard: 네이버 차단 등록/해제/현황 확인 결과를 cg_block_log 에 추가. actor=auth.uid(). ADMIN 전용(R10)';

-- ---------- 6. function privileges (R10: exposed schema → hint roles get EXECUTE, refusal inside) ----------
REVOKE ALL ON FUNCTION public.cg_mark_naver_registered(inet, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_mark_naver_registered(inet, text, text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cg_mark_naver_unregistered(inet) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_mark_naver_unregistered(inet) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cg_log_block(inet, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cg_log_block(inet, text, text, text, jsonb) TO anon, authenticated, service_role;
