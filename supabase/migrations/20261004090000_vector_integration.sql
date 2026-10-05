-- =============================================================
-- Phase 8 — VECTOR integration (AI 읽기 전용 RPC · AI 후보 검토)
-- Plan: docs/repair-intelligence/phases/phase-8-plan.md (APPROVED 2026-10-04, conditions C0–C15, O1 (a), O2 (a))
--
-- New: role vector_agent (NOLOGIN), non-API schema vector_api (agent read / propose functions),
--      table public.ai_candidates (approval queue), review RPCs public.ai_candidate_approve / _reject.
-- No existing table, column, trigger, function, policy, view or grant is changed.
-- temp_file_limit is NOT set here: superuser-only parameter (plan finding 7, O1) — see vector-integration.md.
-- Rollback SQL: supabase/test-fixtures/phase8/rollback.sql
-- =============================================================

-- ---------- 1. role + schema (C2, C7, C11) ----------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vector_agent') THEN
    CREATE ROLE vector_agent NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
  END IF;
END $$;
ALTER ROLE vector_agent NOLOGIN CONNECTION LIMIT 3;
GRANT vector_agent TO postgres;
ALTER ROLE vector_agent SET search_path = vector_api;
ALTER ROLE vector_agent SET statement_timeout = '5s';
ALTER ROLE vector_agent SET idle_in_transaction_session_timeout = '10s';
COMMENT ON ROLE vector_agent IS 'VECTOR(n8n) 전용 DB 역할 — vector_api 함수만 실행. 운영 활성화는 Brad가 직접 (ALTER ROLE … LOGIN PASSWORD)';

CREATE SCHEMA vector_api;
COMMENT ON SCHEMA vector_api IS 'VECTOR 전용 함수 (API 비노출 스키마, R10 예외). 고객 정보·가격·직원·라벨·보관 위치 없음';
REVOKE ALL ON SCHEMA vector_api FROM PUBLIC;
GRANT USAGE ON SCHEMA vector_api TO vector_agent;

-- ---------- 2. table: ai_candidates (C4, C7, C8) ----------
CREATE TABLE public.ai_candidates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_type     text NOT NULL CHECK (candidate_type IN ('COMPATIBILITY', 'PART_ALIAS')),
  source             text NOT NULL DEFAULT 'VECTOR' CHECK (source IN ('VECTOR')),
  part_spec_id       uuid NOT NULL REFERENCES public.part_specs(id) ON DELETE CASCADE,
  target_type        text CHECK (target_type IN ('MODEL', 'VARIANT', 'BOARD')),
  model_id           uuid REFERENCES public.catalog_models(id) ON DELETE CASCADE,
  variant_id         uuid REFERENCES public.catalog_variants(id) ON DELETE CASCADE,
  board_id           uuid REFERENCES public.catalog_boards(id) ON DELETE CASCADE,
  observed_status    text CHECK (observed_status IN ('compatible', 'conditional', 'incompatible')),
  limitation_note    text CHECK (limitation_note IS NULL OR char_length(limitation_note) <= 300),
  reference          text CHECK (reference IS NULL OR char_length(reference) <= 500),
  alias              text CHECK (alias IS NULL OR char_length(alias) <= 150),
  alias_norm         text GENERATED ALWAYS AS (public.catalog_normalize(alias)) STORED,
  alias_type         text CHECK (alias_type IN ('PART_NUMBER', 'MARKING', 'OTHER')),
  rationale          text CHECK (rationale IS NULL OR char_length(rationale) <= 2000),
  source_ref         text CHECK (source_ref IS NULL OR char_length(source_ref) <= 200),
  status             text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  approved_as        text CHECK (approved_as IN ('DOCUMENT', 'INFERENCE')),
  result_evidence_id uuid REFERENCES public.compatibility_evidence(id) ON DELETE RESTRICT,
  result_alias_id    uuid REFERENCES public.part_number_aliases(id) ON DELETE SET NULL,
  reviewed_by        uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at        timestamptz,
  review_note        text CHECK (review_note IS NULL OR char_length(review_note) <= 500),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_candidates_shape CHECK (
    (candidate_type = 'COMPATIBILITY'
     AND target_type IS NOT NULL AND observed_status IS NOT NULL
     AND num_nonnulls(model_id, variant_id, board_id) = 1
     AND (target_type = 'MODEL') = (model_id IS NOT NULL)
     AND (target_type = 'VARIANT') = (variant_id IS NOT NULL)
     AND (target_type = 'BOARD') = (board_id IS NOT NULL)
     AND alias IS NULL AND alias_type IS NULL)
    OR
    (candidate_type = 'PART_ALIAS'
     AND target_type IS NULL AND observed_status IS NULL AND limitation_note IS NULL
     AND num_nonnulls(model_id, variant_id, board_id) = 0
     AND NULLIF(btrim(alias), '') IS NOT NULL AND alias_norm IS NOT NULL AND alias_type IS NOT NULL)),
  CONSTRAINT ai_candidates_conditional_note CHECK (observed_status IS DISTINCT FROM 'conditional' OR NULLIF(btrim(limitation_note), '') IS NOT NULL),
  CONSTRAINT ai_candidates_reviewed CHECK ((status = 'PENDING') = (reviewed_at IS NULL)),
  CONSTRAINT ai_candidates_reject_reason CHECK (status <> 'REJECTED' OR NULLIF(btrim(review_note), '') IS NOT NULL),
  CONSTRAINT ai_candidates_approved_as CHECK (
    approved_as IS NULL OR (status = 'APPROVED' AND candidate_type = 'COMPATIBILITY')),
  CONSTRAINT ai_candidates_results CHECK (
    (result_evidence_id IS NULL OR (status = 'APPROVED' AND candidate_type = 'COMPATIBILITY'))
    AND (result_alias_id IS NULL OR (status = 'APPROVED' AND candidate_type = 'PART_ALIAS')))
);
COMMENT ON TABLE public.ai_candidates IS 'AI(VECTOR) 지식 제안 승인 대기열 — 관리자 승인 시 documented/inferred 근거 또는 부품 별칭으로 전환 (verified 불가, P4)';
COMMENT ON COLUMN public.ai_candidates.rationale IS 'VECTOR 설명 — 검토자에게만 표시, 지식으로 복사하지 않음';
COMMENT ON COLUMN public.ai_candidates.source_ref IS 'VECTOR 대화 / n8n 실행 ID (감사 기록은 n8n 실행 이력, C12)';

-- dedup: identical PENDING proposals (C7)
CREATE UNIQUE INDEX ai_candidates_pending_compat_key ON public.ai_candidates
  (part_spec_id, target_type, coalesce(model_id, variant_id, board_id), observed_status)
  WHERE status = 'PENDING' AND candidate_type = 'COMPATIBILITY';
CREATE UNIQUE INDEX ai_candidates_pending_alias_key ON public.ai_candidates (part_spec_id, alias_norm)
  WHERE status = 'PENDING' AND candidate_type = 'PART_ALIAS';
CREATE INDEX ai_candidates_status_idx       ON public.ai_candidates (status, created_at DESC);
CREATE INDEX ai_candidates_part_spec_idx    ON public.ai_candidates (part_spec_id);
CREATE INDEX ai_candidates_model_idx        ON public.ai_candidates (model_id);
CREATE INDEX ai_candidates_variant_idx      ON public.ai_candidates (variant_id);
CREATE INDEX ai_candidates_board_idx        ON public.ai_candidates (board_id);
CREATE INDEX ai_candidates_evidence_idx     ON public.ai_candidates (result_evidence_id);
CREATE INDEX ai_candidates_alias_result_idx ON public.ai_candidates (result_alias_id);
CREATE INDEX ai_candidates_reviewed_by_idx  ON public.ai_candidates (reviewed_by);

-- candidate content is immutable; only PENDING → APPROVED / REJECTED with the review columns (C8)
CREATE FUNCTION public.ai_candidates_protect() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION '이미 처리된 후보입니다.';
  END IF;
  IF ROW(NEW.id, NEW.candidate_type, NEW.source, NEW.part_spec_id, NEW.target_type, NEW.model_id, NEW.variant_id, NEW.board_id,
         NEW.observed_status, NEW.limitation_note, NEW.reference, NEW.alias, NEW.alias_type, NEW.rationale, NEW.source_ref,
         NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id, OLD.candidate_type, OLD.source, OLD.part_spec_id, OLD.target_type, OLD.model_id, OLD.variant_id, OLD.board_id,
         OLD.observed_status, OLD.limitation_note, OLD.reference, OLD.alias, OLD.alias_type, OLD.rationale, OLD.source_ref,
         OLD.created_at) THEN
    RAISE EXCEPTION 'AI 후보 내용은 수정할 수 없습니다.';
  END IF;
  IF NEW.status NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'AI 후보 상태는 승인 또는 반려로만 바꿀 수 있습니다.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_ai_candidates_protect BEFORE UPDATE ON public.ai_candidates
  FOR EACH ROW EXECUTE FUNCTION public.ai_candidates_protect();

ALTER TABLE public.ai_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_candidates_select ON public.ai_candidates FOR SELECT TO authenticated
  USING (public.get_my_role() = 'ADMIN'::public.employee_role);
REVOKE ALL ON public.ai_candidates FROM anon, authenticated;
GRANT SELECT ON public.ai_candidates TO authenticated;

-- ---------- 3. vector_api helpers (private: no grant to anyone) ----------
CREATE FUNCTION vector_api.require_agent() RETURNS void
  LANGUAGE plpgsql STABLE
  SET search_path = pg_catalog
AS $$
BEGIN
  IF session_user::text = 'vector_agent' OR current_setting('role', true) = 'vector_agent' THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'VECTOR 전용 함수입니다.' USING ERRCODE = '42501';
END;
$$;
COMMENT ON FUNCTION vector_api.require_agent() IS 'VECTOR 함수 호출자 확인 (로그인 역할 또는 SET ROLE 이 vector_agent)';

-- 자유 텍스트 마스킹 (C5): 이메일, 카드번호 형태, 주민번호 형태, 전화번호 → [마스킹]; 해당 접수건 고객명 → [고객]
CREATE FUNCTION vector_api.mask_text(p_text text, p_customer_name text DEFAULT NULL) RETURNS text
  LANGUAGE plpgsql IMMUTABLE
  SET search_path = pg_catalog
AS $$
DECLARE
  v       text := p_text;
  v_name  text := regexp_replace(coalesce(p_customer_name, ''), '\s+', '', 'g');
  v_pat   text;
BEGIN
  IF v IS NULL OR v = '' THEN
    RETURN v;
  END IF;
  -- e-mail
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[마스킹]', 'g');
  -- card number form: 16 digits (4-4-4-4) and 15 digits (4-6-5)
  v := regexp_replace(v, '(?<![0-9])[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}[- ]?[0-9]{4}(?![0-9])', '[마스킹]', 'g');
  v := regexp_replace(v, '(?<![0-9])[0-9]{4}[- ]?[0-9]{6}[- ]?[0-9]{5}(?![0-9])', '[마스킹]', 'g');
  -- resident registration number form
  v := regexp_replace(v, '(?<![0-9])[0-9]{6}[- ]?[1-8][0-9]{6}(?![0-9])', '[마스킹]', 'g');
  -- phone: +82 and domestic
  v := regexp_replace(v, '\+ ?82[- .]?0?[0-9]{1,2}[- .]?[0-9]{3,4}[- .]?[0-9]{4}(?![0-9])', '[마스킹]', 'g');
  v := regexp_replace(v, '(?<![0-9+])0[0-9]{1,2}[- .]?[0-9]{3,4}[- .]?[0-9]{4}(?![0-9])', '[마스킹]', 'g');
  -- customer name of the ticket (≥ 2 characters; spaces between characters allowed)
  IF char_length(v_name) >= 2 THEN
    SELECT string_agg(regexp_replace(c, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g'), '\s*' ORDER BY i)
      INTO v_pat
      FROM regexp_split_to_table(v_name, '') WITH ORDINALITY AS t(c, i);
    v := regexp_replace(v, v_pat, '[고객]', 'gi');
  END IF;
  RETURN v;
END;
$$;
COMMENT ON FUNCTION vector_api.mask_text(text, text) IS 'VECTOR 반환 전 자유 텍스트 마스킹 (C5)';

-- ---------- 4. agent read functions (C6, C13) ----------
CREATE FUNCTION vector_api.find_devices(p_query text, p_limit integer DEFAULT 10) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, extensions
AS $$
DECLARE
  v_limit  integer := least(greatest(coalesce(p_limit, 10), 1), 30);
  v_models jsonb;
  v_boards jsonb;
BEGIN
  PERFORM vector_api.require_agent();
  IF NULLIF(btrim(p_query), '') IS NULL THEN
    RETURN jsonb_build_object('error', '검색어를 입력해 주세요.');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('model_id', m.model_id, 'variant_id', m.variant_id, 'brand', m.brand_name,
                                               'model', m.model_name, 'variant', m.variant_name, 'score', m.score)
                            ORDER BY m.score DESC, m.brand_name, m.model_name), '[]'::jsonb)
    INTO v_models
    FROM public.catalog_search_models(p_query, v_limit) m;
  SELECT coalesce(jsonb_agg(jsonb_build_object('board_id', b.board_id, 'board_number', b.board_number,
                                               'manufacturer', b.manufacturer, 'score', b.score)
                            ORDER BY b.score DESC, b.board_number), '[]'::jsonb)
    INTO v_boards
    FROM public.catalog_search_boards(p_query, v_limit) b;
  RETURN jsonb_build_object('models', v_models, 'boards', v_boards);
END;
$$;
COMMENT ON FUNCTION vector_api.find_devices(text, integer) IS 'VECTOR: 모델/변형·메인보드 검색 (최대 30)';

CREATE FUNCTION vector_api.find_parts(p_query text, p_limit integer DEFAULT 10) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, extensions
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 30);
  v_parts jsonb;
BEGIN
  PERFORM vector_api.require_agent();
  IF NULLIF(btrim(p_query), '') IS NULL THEN
    RETURN jsonb_build_object('error', '검색어를 입력해 주세요.');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'part_spec_id', s.part_spec_id, 'part_type', s.part_type, 'name', s.name, 'manufacturer', s.manufacturer,
           'compat_target', s.compat_target, 'matched', s.matched, 'score', s.score,
           'aliases', (SELECT coalesce(jsonb_agg(jsonb_build_object('alias', a.alias, 'alias_type', a.alias_type)
                                                 ORDER BY a.alias), '[]'::jsonb)
                         FROM public.part_number_aliases a WHERE a.part_spec_id = s.part_spec_id))
           ORDER BY s.score DESC, s.name), '[]'::jsonb)
    INTO v_parts
    FROM public.part_spec_search(p_query, v_limit) s;
  RETURN jsonb_build_object('parts', v_parts);
END;
$$;
COMMENT ON FUNCTION vector_api.find_parts(text, integer) IS 'VECTOR: 부품 규격 검색 (이름·품번·칩 마킹, 최대 30)';

-- shared row shape for compatibility results; verified → documented → inferred → other (C13)
CREATE FUNCTION vector_api.compat_order(p_confidence text) RETURNS integer
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog
AS $$
  SELECT CASE p_confidence WHEN 'verified' THEN 1 WHEN 'documented' THEN 2 WHEN 'inferred' THEN 3 ELSE 4 END;
$$;


-- 호환 결과 한 행 (가격·고객 정보 없음, 제한사항은 마스킹)
CREATE FUNCTION vector_api.compat_row(p_row jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE
  SET search_path = pg_catalog
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
           'part_spec_id', p_row->'part_spec_id', 'part_type', p_row->'part_type', 'part_name', p_row->'part_name',
           'manufacturer', p_row->'manufacturer', 'target_type', p_row->'target_type', 'target_id', p_row->'target_id',
           'target_label', p_row->'target_label', 'linked_models', p_row->'linked_models'))
         || jsonb_build_object(
           'status', p_row->'status', 'confidence', p_row->'confidence',
           'limitation_note', vector_api.mask_text(p_row->>'limitation_note'),
           'evidence', jsonb_build_object('install_ok', p_row->'install_ok', 'install_conditional', p_row->'install_conditional',
                                          'install_incompatible', p_row->'install_incompatible',
                                          'document_count', p_row->'document_count'),
           'is_candidate', p_row->'is_candidate')
         || CASE WHEN p_row ? 'stock_qty'
                 THEN jsonb_build_object('stock_qty', p_row->'stock_qty', 'donor_qty', p_row->'donor_qty')
                 ELSE '{}'::jsonb END;
$$;

CREATE FUNCTION vector_api.parts_for_device(p_model_id uuid DEFAULT NULL, p_variant_id uuid DEFAULT NULL,
                                            p_board_id uuid DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, extensions
AS $$
DECLARE
  v_compatible   jsonb;
  v_incompatible jsonb;
BEGIN
  PERFORM vector_api.require_agent();
  BEGIN
    SELECT coalesce(jsonb_agg(vector_api.compat_row(to_jsonb(s))
                              ORDER BY vector_api.compat_order(s.confidence), (s.stock_qty > 0) DESC, (s.donor_qty > 0) DESC,
                                       s.part_name, s.target_label)
                      FILTER (WHERE s.status <> 'incompatible'), '[]'::jsonb),
           coalesce(jsonb_agg(vector_api.compat_row(to_jsonb(s)) ORDER BY s.part_name, s.target_label)
                      FILTER (WHERE s.status = 'incompatible'), '[]'::jsonb)
      INTO v_compatible, v_incompatible
      FROM public.search_parts_for_device(p_model_id, p_variant_id, p_board_id) s;
  EXCEPTION WHEN raise_exception THEN
    RETURN jsonb_build_object('error', SQLERRM);
  END;
  RETURN jsonb_build_object('compatible', v_compatible, 'incompatible', v_incompatible);
END;
$$;
COMMENT ON FUNCTION vector_api.parts_for_device(uuid, uuid, uuid) IS
  'VECTOR: 기기 → 호환 부품. compatible(verified → documented → inferred 순)과 incompatible 분리, 근거 횟수 포함 (C13)';

CREATE FUNCTION vector_api.devices_for_part(p_part_spec_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, extensions
AS $$
DECLARE
  v_compatible   jsonb;
  v_incompatible jsonb;
BEGIN
  PERFORM vector_api.require_agent();
  IF p_part_spec_id IS NULL OR NOT EXISTS (SELECT 1 FROM part_specs WHERE id = p_part_spec_id) THEN
    RETURN jsonb_build_object('error', '부품 규격을 찾을 수 없습니다.');
  END IF;
  SELECT coalesce(jsonb_agg(vector_api.compat_row(to_jsonb(s))
                            ORDER BY vector_api.compat_order(s.confidence), s.target_label)
                    FILTER (WHERE s.status <> 'incompatible'), '[]'::jsonb),
         coalesce(jsonb_agg(vector_api.compat_row(to_jsonb(s)) ORDER BY s.target_label)
                    FILTER (WHERE s.status = 'incompatible'), '[]'::jsonb)
    INTO v_compatible, v_incompatible
    FROM public.search_devices_for_part(p_part_spec_id) s;
  RETURN jsonb_build_object('compatible', v_compatible, 'incompatible', v_incompatible);
END;
$$;
COMMENT ON FUNCTION vector_api.devices_for_part(uuid) IS
  'VECTOR: 부품 → 호환 기기. compatible(verified → documented → inferred 순)과 incompatible 분리 (C13)';

CREATE FUNCTION vector_api.part_stock(p_part_spec_id uuid) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, extensions
AS $$
DECLARE
  v_spec   part_specs;
  v_stock  jsonb;
  v_donors jsonb;
BEGIN
  PERFORM vector_api.require_agent();
  SELECT * INTO v_spec FROM part_specs WHERE id = p_part_spec_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '부품 규격을 찾을 수 없습니다.');
  END IF;
  -- 상태별 수량만 (외주 제외, 가격·라벨·위치 없음)
  SELECT jsonb_build_object('NEW',  coalesce(sum(i.quantity) FILTER (WHERE i.condition = 'NEW'), 0),
                            'USED', coalesce(sum(i.quantity) FILTER (WHERE i.condition = 'USED'), 0))
    INTO v_stock
    FROM inventory_items i JOIN inventory_specs s ON s.id = i.spec_id
   WHERE i.part_spec_id = p_part_spec_id AND s.name <> '외주';
  -- 사용 가능한 Donor 번호만
  SELECT coalesce(jsonb_agg(x.donor_no ORDER BY x.donor_no), '[]'::jsonb) INTO v_donors
    FROM (SELECT DISTINCT d.donor_no FROM donor_potential_stock d WHERE d.part_spec_id = p_part_spec_id) x;
  RETURN jsonb_build_object('part_spec_id', v_spec.id, 'part_type', v_spec.part_type, 'name', v_spec.name,
                            'stock', v_stock, 'donor_numbers', v_donors);
END;
$$;
COMMENT ON FUNCTION vector_api.part_stock(uuid) IS 'VECTOR: 부품 규격 재고 — 상태별 수량 + Donor 번호만 (C6)';

CREATE FUNCTION vector_api.device_cases(p_model_id uuid DEFAULT NULL, p_variant_id uuid DEFAULT NULL,
                                        p_board_id uuid DEFAULT NULL, p_limit integer DEFAULT 10) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, extensions
AS $$
DECLARE
  v_limit     integer := least(greatest(coalesce(p_limit, 10), 1), 20);
  v_model     uuid := p_model_id;
  v_label     text;
  v_boards    jsonb;
  v_board_ids uuid[];
  v_notes     jsonb;
  v_case_ids  uuid[];
  v_by_result jsonb;
  v_by_status jsonb;
  v_recent    jsonb := '[]'::jsonb;
  v_skipped   integer := 0;
  v_case      jsonb;
  r           record;
BEGIN
  PERFORM vector_api.require_agent();
  IF p_variant_id IS NOT NULL THEN
    SELECT cv.model_id INTO v_model FROM catalog_variants cv
     WHERE cv.id = p_variant_id AND (p_model_id IS NULL OR cv.model_id = p_model_id);
    IF v_model IS NULL THEN
      RETURN jsonb_build_object('error', '선택한 변형이 모델에 속하지 않습니다.');
    END IF;
  END IF;
  IF v_model IS NULL AND p_board_id IS NULL THEN
    RETURN jsonb_build_object('error', '검색할 모델 또는 보드를 선택해 주세요.');
  END IF;

  SELECT concat_ws(' / ',
           (SELECT concat_ws(' ', br.name, cm.name, (SELECT cv.name FROM catalog_variants cv WHERE cv.id = p_variant_id))
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

  -- 모델/보드 메모: 종류 + 본문(마스킹), 작성자 없음
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'note_type', n.note_type, 'body', vector_api.mask_text(n.body), 'is_pinned', n.is_pinned,
           'target_label', coalesce(cb.board_number, concat_ws(' ', cm.name, cv.name)))
           ORDER BY n.is_pinned DESC, (n.note_type = 'CAUTION') DESC, n.updated_at DESC), '[]'::jsonb)
    INTO v_notes
    FROM model_notes n
    LEFT JOIN catalog_models cm ON cm.id = n.model_id
    LEFT JOIN catalog_variants cv ON cv.id = n.variant_id
    LEFT JOIN catalog_boards cb ON cb.id = n.board_id
   WHERE (n.model_id = v_model AND (p_variant_id IS NULL OR n.variant_id IS NULL OR n.variant_id = p_variant_id))
      OR n.board_id = ANY (v_board_ids);

  -- 사례: 테스트 접수 제외, 최신순 (진행 중·취소 포함 — Phase 5 결정 8)
  SELECT coalesce(array_agg(t.id ORDER BY coalesce(t.received_at, t.created_at) DESC, t.id), '{}'::uuid[])
    INTO v_case_ids
    FROM repair_tickets t
   WHERE NOT t.is_test
     AND ((v_model IS NOT NULL AND t.catalog_model_id = v_model
           AND (p_variant_id IS NULL OR t.catalog_variant_id = p_variant_id))
          OR (p_board_id IS NOT NULL AND t.catalog_board_id = p_board_id));

  SELECT coalesce(jsonb_object_agg(x.k, x.n), '{}'::jsonb) INTO v_by_result
    FROM (SELECT coalesce(rr.result, 'NONE') AS k, count(*) AS n
            FROM unnest(v_case_ids) AS c(id) LEFT JOIN repair_records rr ON rr.ticket_id = c.id
           GROUP BY 1) x;
  SELECT coalesce(jsonb_object_agg(x.k, x.n), '{}'::jsonb) INTO v_by_status
    FROM (SELECT CASE WHEN t.status IN ('COMPLETED', 'CANCELED') THEN t.status::text ELSE 'OPEN' END AS k, count(*) AS n
            FROM unnest(v_case_ids) AS c(id) JOIN repair_tickets t ON t.id = c.id
           GROUP BY 1) x;

  -- 사례를 하나씩 조립, 오류가 나면 그 사례만 건너뜀. 자유 텍스트는 그 접수건 고객명까지 마스킹 (C5)
  FOR r IN SELECT c.id FROM unnest(v_case_ids[1:v_limit]) WITH ORDINALITY AS c(id, ord) ORDER BY c.ord LOOP
    BEGIN
      SELECT jsonb_build_object(
               'receipt_no', t.receipt_no,
               'status', t.status,
               'received_month', to_char(t.received_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM'),
               'completed_month', to_char(t.completed_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM'),
               'result', rr.result,
               'fault_category', rr.fault_category,
               'diagnosis_summary', vector_api.mask_text(rr.diagnosis_summary, cu.name),
               'symptoms', (SELECT coalesce(jsonb_agg(sc.name ORDER BY sc.sort_order, sc.name), '[]'::jsonb)
                              FROM ticket_symptoms ts JOIN symptom_codes sc ON sc.id = ts.symptom_code_id
                             WHERE ts.ticket_id = t.id),
               'faults', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                   'component', vector_api.mask_text(f.component, cu.name), 'fault_type', f.fault_type,
                                   'description', vector_api.mask_text(f.description, cu.name))
                                 ORDER BY f.sort_order, f.created_at), '[]'::jsonb)
                            FROM repair_faults f WHERE f.ticket_id = t.id),
               'measurements', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                   'label', vector_api.mask_text(m.label, cu.name), 'kind', m.kind, 'value', m.value,
                                   'unit', m.unit, 'value_text', vector_api.mask_text(m.value_text, cu.name),
                                   'judgement', m.judgement, 'note', vector_api.mask_text(m.note, cu.name))
                                 ORDER BY m.sort_order, m.created_at), '[]'::jsonb)
                                  FROM repair_measurements m WHERE m.ticket_id = t.id),
               'actions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                                   'action_type', a.action_type,
                                   'description', vector_api.mask_text(a.description, cu.name), 'succeeded', a.succeeded)
                                 ORDER BY a.sort_order, a.performed_at), '[]'::jsonb)
                             FROM repair_actions a WHERE a.ticket_id = t.id),
               'parts', (SELECT coalesce(jsonb_agg(jsonb_build_object('category', p.category_name, 'spec', p.spec_name,
                                                                      'product', p.product_name, 'capacity', p.capacity,
                                                                      'quantity', p.quantity)
                                                   ORDER BY p.category_name, p.product_name), '[]'::jsonb)
                           FROM repair_parts_used p WHERE p.ticket_id = t.id AND NOT p.is_outsourced))
        INTO v_case
        FROM repair_tickets t
        LEFT JOIN repair_records rr ON rr.ticket_id = t.id
        LEFT JOIN customers cu ON cu.id = t.customer_id
       WHERE t.id = r.id;
      v_recent := v_recent || jsonb_build_array(v_case);
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'label', v_label,
    'boards', v_boards,
    'model_notes', v_notes,
    'cases', jsonb_build_object('total', cardinality(v_case_ids), 'by_result', v_by_result, 'by_status', v_by_status,
                                'recent', v_recent, 'skipped', v_skipped));
END;
$$;
COMMENT ON FUNCTION vector_api.device_cases(uuid, uuid, uuid, integer) IS
  'VECTOR: 기기 수리 사례 (접수번호만, 고객·가격·직원 없음, 자유 텍스트 마스킹, 최대 20건)';

-- ---------- 5. agent write functions (the only write path; C4, C7) ----------
CREATE FUNCTION vector_api.propose_compatibility(
  p_part_spec_id uuid, p_target_type text, p_target_id uuid, p_observed_status text,
  p_limitation_note text DEFAULT NULL, p_reference text DEFAULT NULL, p_rationale text DEFAULT NULL,
  p_source_ref text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, extensions
AS $$
DECLARE
  v_compat_target text;
  v_note          text := NULLIF(btrim(p_limitation_note), '');
  v_ref           text := NULLIF(btrim(p_reference), '');
  v_rationale     text := NULLIF(btrim(p_rationale), '');
  v_source        text := NULLIF(btrim(p_source_ref), '');
  v_id            uuid;
BEGIN
  PERFORM vector_api.require_agent();
  BEGIN
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
    IF p_target_type = 'MODEL' AND NOT EXISTS (SELECT 1 FROM catalog_models WHERE id = p_target_id) THEN
      RAISE EXCEPTION '표준 모델을 찾을 수 없습니다.';
    ELSIF p_target_type = 'VARIANT' AND NOT EXISTS (SELECT 1 FROM catalog_variants WHERE id = p_target_id) THEN
      RAISE EXCEPTION '모델 변형을 찾을 수 없습니다.';
    ELSIF p_target_type = 'BOARD' AND NOT EXISTS (SELECT 1 FROM catalog_boards WHERE id = p_target_id) THEN
      RAISE EXCEPTION '메인보드를 찾을 수 없습니다.';
    END IF;
    IF p_observed_status IS NULL OR p_observed_status NOT IN ('compatible', 'conditional', 'incompatible') THEN
      RAISE EXCEPTION '호환 여부(호환/조건부/비호환)를 선택해 주세요.';
    END IF;
    IF p_observed_status = 'conditional' AND v_note IS NULL THEN
      RAISE EXCEPTION '조건부는 제한사항을 입력해 주세요.';
    END IF;
    IF char_length(v_note) > 300 THEN
      RAISE EXCEPTION '제한사항은 300자 이내로 입력해 주세요.';
    END IF;
    IF char_length(v_ref) > 500 THEN
      RAISE EXCEPTION '출처는 500자 이내로 입력해 주세요.';
    END IF;
    IF char_length(v_rationale) > 2000 THEN
      RAISE EXCEPTION '설명은 2000자 이내로 입력해 주세요.';
    END IF;
    IF char_length(v_source) > 200 THEN
      RAISE EXCEPTION '실행 ID는 200자 이내로 입력해 주세요.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('vector_api.propose'));
    SELECT id INTO v_id FROM ai_candidates
     WHERE status = 'PENDING' AND candidate_type = 'COMPATIBILITY' AND part_spec_id = p_part_spec_id
       AND target_type = p_target_type AND coalesce(model_id, variant_id, board_id) = p_target_id
       AND observed_status = p_observed_status;
    IF FOUND THEN
      RETURN jsonb_build_object('candidate_id', v_id, 'status', 'PENDING', 'duplicate', true);
    END IF;
    IF (SELECT count(*) FROM ai_candidates WHERE status = 'PENDING') >= 500 THEN
      RAISE EXCEPTION '검토 대기 중인 AI 후보가 500건이라 더 제안할 수 없습니다. 관리자 검토 후 다시 제안해 주세요.';
    END IF;

    INSERT INTO ai_candidates (candidate_type, part_spec_id, target_type, model_id, variant_id, board_id,
                               observed_status, limitation_note, reference, rationale, source_ref)
    VALUES ('COMPATIBILITY', p_part_spec_id, p_target_type,
            CASE WHEN p_target_type = 'MODEL' THEN p_target_id END,
            CASE WHEN p_target_type = 'VARIANT' THEN p_target_id END,
            CASE WHEN p_target_type = 'BOARD' THEN p_target_id END,
            p_observed_status, v_note, v_ref, v_rationale, v_source)
    RETURNING id INTO v_id;
  EXCEPTION WHEN raise_exception THEN
    RETURN jsonb_build_object('error', SQLERRM);
  END;
  RETURN jsonb_build_object('candidate_id', v_id, 'status', 'PENDING', 'duplicate', false);
END;
$$;
COMMENT ON FUNCTION vector_api.propose_compatibility(uuid, text, uuid, text, text, text, text, text) IS
  'VECTOR: 호환성 제안 → ai_candidates (PENDING, 중복 제거, 대기 500건 상한)';

CREATE FUNCTION vector_api.propose_part_alias(
  p_part_spec_id uuid, p_alias text, p_alias_type text DEFAULT 'PART_NUMBER', p_rationale text DEFAULT NULL,
  p_source_ref text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, extensions
AS $$
DECLARE
  v_alias     text := NULLIF(btrim(p_alias), '');
  v_norm      text := catalog_normalize(p_alias);
  v_rationale text := NULLIF(btrim(p_rationale), '');
  v_source    text := NULLIF(btrim(p_source_ref), '');
  v_id        uuid;
BEGIN
  PERFORM vector_api.require_agent();
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM part_specs WHERE id = p_part_spec_id) THEN
      RAISE EXCEPTION '부품 규격을 찾을 수 없습니다.';
    END IF;
    IF v_alias IS NULL OR v_norm IS NULL THEN
      RAISE EXCEPTION '별칭을 입력해 주세요.';
    END IF;
    IF char_length(v_alias) > 150 THEN
      RAISE EXCEPTION '별칭은 150자 이내로 입력해 주세요.';
    END IF;
    IF p_alias_type IS NULL OR p_alias_type NOT IN ('PART_NUMBER', 'MARKING', 'OTHER') THEN
      RAISE EXCEPTION '별칭 종류(품번/마킹/기타)를 선택해 주세요.';
    END IF;
    IF EXISTS (SELECT 1 FROM part_number_aliases WHERE part_spec_id = p_part_spec_id AND alias_norm = v_norm) THEN
      RAISE EXCEPTION '이미 등록된 별칭입니다.';
    END IF;
    IF char_length(v_rationale) > 2000 THEN
      RAISE EXCEPTION '설명은 2000자 이내로 입력해 주세요.';
    END IF;
    IF char_length(v_source) > 200 THEN
      RAISE EXCEPTION '실행 ID는 200자 이내로 입력해 주세요.';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('vector_api.propose'));
    SELECT id INTO v_id FROM ai_candidates
     WHERE status = 'PENDING' AND candidate_type = 'PART_ALIAS' AND part_spec_id = p_part_spec_id AND alias_norm = v_norm;
    IF FOUND THEN
      RETURN jsonb_build_object('candidate_id', v_id, 'status', 'PENDING', 'duplicate', true);
    END IF;
    IF (SELECT count(*) FROM ai_candidates WHERE status = 'PENDING') >= 500 THEN
      RAISE EXCEPTION '검토 대기 중인 AI 후보가 500건이라 더 제안할 수 없습니다. 관리자 검토 후 다시 제안해 주세요.';
    END IF;

    INSERT INTO ai_candidates (candidate_type, part_spec_id, alias, alias_type, rationale, source_ref)
    VALUES ('PART_ALIAS', p_part_spec_id, v_alias, p_alias_type, v_rationale, v_source)
    RETURNING id INTO v_id;
  EXCEPTION WHEN raise_exception THEN
    RETURN jsonb_build_object('error', SQLERRM);
  END;
  RETURN jsonb_build_object('candidate_id', v_id, 'status', 'PENDING', 'duplicate', false);
END;
$$;
COMMENT ON FUNCTION vector_api.propose_part_alias(uuid, text, text, text, text) IS
  'VECTOR: 부품 별칭(품번/마킹) 제안 → ai_candidates (PENDING, 중복 제거, 대기 500건 상한)';

-- ---------- 6. admin review RPCs (exposed schema → R10: grant to hint roles, refuse inside; C0, C8) ----------
CREATE FUNCTION public.ai_candidate_approve(p_candidate_id uuid, p_approve_as text DEFAULT NULL,
                                            p_reference text DEFAULT NULL, p_note text DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  c          ai_candidates;
  v_note     text := NULLIF(btrim(p_note), '');
  v_ref      text;
  v_res      jsonb;
  v_alias_id uuid;
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '관리자만 AI 후보를 검토할 수 있습니다.';
  END IF;
  SELECT * INTO c FROM ai_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI 후보를 찾을 수 없습니다.';
  END IF;
  IF c.status <> 'PENDING' THEN
    RAISE EXCEPTION '이미 처리된 후보입니다.';
  END IF;
  IF char_length(v_note) > 500 THEN
    RAISE EXCEPTION '검토 메모는 500자 이내로 입력해 주세요.';
  END IF;

  IF c.candidate_type = 'COMPATIBILITY' THEN
    -- 문서 근거(documented) 또는 추정(inferred)만 — 실장(verified)·관리자 조정은 후보에서 만들 수 없다 (P4)
    IF p_approve_as IS NULL OR p_approve_as NOT IN ('DOCUMENT', 'INFERENCE') THEN
      RAISE EXCEPTION '승인 방식(문서 근거 / 추정)을 선택해 주세요.';
    END IF;
    v_ref := coalesce(NULLIF(btrim(p_reference), ''), NULLIF(btrim(c.reference), ''));
    IF char_length(v_ref) > 500 THEN
      RAISE EXCEPTION '출처는 500자 이내로 입력해 주세요.';
    END IF;
    IF p_approve_as = 'DOCUMENT' AND v_ref IS NULL THEN
      RAISE EXCEPTION '문서 근거로 승인하려면 출처를 입력해 주세요.';
    END IF;
    v_res := record_compatibility_result(c.part_spec_id, c.target_type, coalesce(c.model_id, c.variant_id, c.board_id),
                                         p_approve_as, c.observed_status, c.limitation_note, v_ref,
                                         'AI 후보(VECTOR) 승인' || coalesce(' — ' || v_note, ''));
    UPDATE ai_candidates
       SET status = 'APPROVED', approved_as = p_approve_as, result_evidence_id = (v_res->>'evidence_id')::uuid,
           reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
     WHERE id = c.id;
    RETURN jsonb_build_object('candidate_id', c.id, 'status', 'APPROVED', 'approved_as', p_approve_as,
                              'evidence_id', v_res->'evidence_id', 'compat_status', v_res->'status',
                              'confidence', v_res->'confidence');
  END IF;

  -- PART_ALIAS
  IF p_approve_as IS NOT NULL THEN
    RAISE EXCEPTION '부품 별칭 후보는 승인 방식을 선택하지 않습니다.';
  END IF;
  IF EXISTS (SELECT 1 FROM part_number_aliases WHERE part_spec_id = c.part_spec_id AND alias_norm = c.alias_norm) THEN
    RAISE EXCEPTION '이미 등록된 별칭입니다.';
  END IF;
  INSERT INTO part_number_aliases (part_spec_id, alias, alias_type)
  VALUES (c.part_spec_id, c.alias, c.alias_type)
  RETURNING id INTO v_alias_id;
  UPDATE ai_candidates
     SET status = 'APPROVED', result_alias_id = v_alias_id, reviewed_by = auth.uid(), reviewed_at = now(), review_note = v_note
   WHERE id = c.id;
  RETURN jsonb_build_object('candidate_id', c.id, 'status', 'APPROVED', 'alias_id', v_alias_id);
END;
$$;
COMMENT ON FUNCTION public.ai_candidate_approve(uuid, text, text, text) IS
  'AI 후보 승인 (관리자): 호환성 → record_compatibility_result(DOCUMENT/INFERENCE), 별칭 → part_number_aliases. 검토자·시각 기록';

CREATE FUNCTION public.ai_candidate_reject(p_candidate_id uuid, p_reason text) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  c        ai_candidates;
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  PERFORM public.ri_api_guard_definer('{anon}');
  IF get_my_role() IS DISTINCT FROM 'ADMIN'::employee_role THEN
    RAISE EXCEPTION '관리자만 AI 후보를 검토할 수 있습니다.';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION '반려 사유를 입력해 주세요.';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION '반려 사유는 500자 이내로 입력해 주세요.';
  END IF;
  SELECT * INTO c FROM ai_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI 후보를 찾을 수 없습니다.';
  END IF;
  IF c.status <> 'PENDING' THEN
    RAISE EXCEPTION '이미 처리된 후보입니다.';
  END IF;
  UPDATE ai_candidates
     SET status = 'REJECTED', review_note = v_reason, reviewed_by = auth.uid(), reviewed_at = now()
   WHERE id = c.id;
  RETURN jsonb_build_object('candidate_id', c.id, 'status', 'REJECTED');
END;
$$;
COMMENT ON FUNCTION public.ai_candidate_reject(uuid, text) IS 'AI 후보 반려 (관리자, 사유 필수). 검토자·시각 기록';

-- ---------- 7. function privileges ----------
-- vector_api (not exposed, R10 exception): agent functions → vector_agent only; helpers → nobody (owner only)
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vector_api FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  vector_api.find_devices(text, integer),
  vector_api.find_parts(text, integer),
  vector_api.parts_for_device(uuid, uuid, uuid),
  vector_api.devices_for_part(uuid),
  vector_api.part_stock(uuid),
  vector_api.device_cases(uuid, uuid, uuid, integer),
  vector_api.propose_compatibility(uuid, text, uuid, text, text, text, text, text),
  vector_api.propose_part_alias(uuid, text, text, text, text)
TO vector_agent;

-- public (exposed): R10 — EXECUTE for the hint roles, refusal inside (guard + ADMIN check; trigger: Postgres refuses direct calls)
REVOKE ALL ON FUNCTION public.ai_candidate_approve(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_candidate_reject(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_candidates_protect() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_candidate_approve(uuid, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_candidate_reject(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ai_candidates_protect() TO anon, authenticated, service_role;
