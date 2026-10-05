-- =============================================================
-- Phase 1 — Device master data (기기 마스터, catalog_*)
-- Plan: docs/repair-intelligence/phases/phase-1-plan.md (APPROVED 2026-09-28)
--
-- New extension, tables, functions, one new trigger and three nullable columns on
-- repair_tickets. One existing function is replaced (approved Amendment A):
-- protect_approved_ticket() gets a narrow catalog_link_sync early exit (section 4b).
-- Rollback SQL: see the plan §6 / phase-1-report.md.
-- =============================================================

-- ---------- 1. extension ----------
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ---------- 2. normalisation ----------
-- 대소문자·공백·기호 차이를 없앤 비교용 문자열 (한글·영문·숫자만 남김). 빈 결과는 NULL.
CREATE FUNCTION public.catalog_normalize(p text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  SET search_path = ''
AS $$
  SELECT NULLIF(lower(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z가-힣]', '', 'g')), '');
$$;
COMMENT ON FUNCTION public.catalog_normalize(text) IS '기기 마스터 비교용 정규화: 한글/영문/숫자만 남기고 소문자화 (빈 값은 NULL)';

-- updated_at for catalog tables (existing update_updated_at is not reused)
CREATE FUNCTION public.catalog_set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------- 3. tables ----------
CREATE TABLE public.catalog_brands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(name) <= 50),
  name_norm  text GENERATED ALWAYS AS (public.catalog_normalize(name)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_brands_name_norm_not_null CHECK (name_norm IS NOT NULL),
  CONSTRAINT catalog_brands_name_norm_key UNIQUE (name_norm)
);
COMMENT ON TABLE public.catalog_brands IS '기기 마스터: 브랜드';

CREATE TABLE public.catalog_models (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     uuid NOT NULL REFERENCES public.catalog_brands(id) ON DELETE RESTRICT,
  name         text NOT NULL CHECK (char_length(name) <= 100),
  name_norm    text GENERATED ALWAYS AS (public.catalog_normalize(name)) STORED,
  device_type  public.device_type,
  release_year integer CHECK (release_year IS NULL OR release_year BETWEEN 1980 AND 2100),
  notes        text,
  needs_review boolean NOT NULL DEFAULT false,
  created_by   uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_models_name_norm_not_null CHECK (name_norm IS NOT NULL),
  CONSTRAINT catalog_models_brand_name_key UNIQUE (brand_id, name_norm)
);
COMMENT ON TABLE public.catalog_models IS '기기 마스터: 표준 모델 (device_models AI 캐시와 별개)';
COMMENT ON COLUMN public.catalog_models.needs_review IS '관리자 외 직원이 인라인 등록한 모델 — 관리자 검토 필요';
CREATE INDEX catalog_models_name_norm_trgm ON public.catalog_models USING gin (name_norm extensions.gin_trgm_ops);
CREATE INDEX catalog_models_created_by_idx ON public.catalog_models (created_by);
CREATE TRIGGER trg_catalog_models_updated_at BEFORE UPDATE ON public.catalog_models
  FOR EACH ROW EXECUTE FUNCTION public.catalog_set_updated_at();

CREATE TABLE public.catalog_variants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id   uuid NOT NULL REFERENCES public.catalog_models(id) ON DELETE CASCADE,
  name       text NOT NULL CHECK (char_length(name) <= 100),
  name_norm  text GENERATED ALWAYS AS (public.catalog_normalize(name)) STORED,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_variants_name_norm_not_null CHECK (name_norm IS NOT NULL),
  CONSTRAINT catalog_variants_model_name_key UNIQUE (model_id, name_norm),
  CONSTRAINT catalog_variants_id_model_key UNIQUE (id, model_id)
);
COMMENT ON TABLE public.catalog_variants IS '기기 마스터: 모델별 변형 (예: OLED/LCD, 터치/비터치)';

CREATE TABLE public.catalog_model_aliases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id   uuid NOT NULL REFERENCES public.catalog_models(id) ON DELETE CASCADE,
  variant_id uuid,
  alias      text NOT NULL CHECK (char_length(alias) <= 200),
  alias_norm text GENERATED ALWAYS AS (public.catalog_normalize(alias)) STORED,
  source     text NOT NULL CHECK (source IN ('created', 'manual', 'mapping')),
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_model_aliases_alias_norm_not_null CHECK (alias_norm IS NOT NULL),
  CONSTRAINT catalog_model_aliases_alias_norm_key UNIQUE (alias_norm),
  CONSTRAINT catalog_model_aliases_variant_fk FOREIGN KEY (variant_id, model_id)
    REFERENCES public.catalog_variants(id, model_id) ON DELETE CASCADE
);
COMMENT ON TABLE public.catalog_model_aliases IS '기기 마스터: 모델 별칭 (정규화 기준 전역 유일)';
CREATE INDEX catalog_model_aliases_alias_norm_trgm ON public.catalog_model_aliases USING gin (alias_norm extensions.gin_trgm_ops);
CREATE INDEX catalog_model_aliases_model_idx ON public.catalog_model_aliases (model_id);
CREATE INDEX catalog_model_aliases_variant_idx ON public.catalog_model_aliases (variant_id, model_id);
CREATE INDEX catalog_model_aliases_created_by_idx ON public.catalog_model_aliases (created_by);

CREATE TABLE public.catalog_boards (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_number      text NOT NULL CHECK (char_length(board_number) <= 100),
  board_number_norm text GENERATED ALWAYS AS (public.catalog_normalize(board_number)) STORED,
  manufacturer      text CHECK (manufacturer IS NULL OR char_length(manufacturer) <= 50),
  notes             text,
  created_by        uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_boards_number_norm_not_null CHECK (board_number_norm IS NOT NULL),
  CONSTRAINT catalog_boards_number_norm_key UNIQUE (board_number_norm)
);
COMMENT ON TABLE public.catalog_boards IS '기기 마스터: 메인보드 번호 (예: LA-K091P, NM-D451, BA92-xxxxx)';
CREATE INDEX catalog_boards_number_norm_trgm ON public.catalog_boards USING gin (board_number_norm extensions.gin_trgm_ops);
CREATE INDEX catalog_boards_created_by_idx ON public.catalog_boards (created_by);
CREATE TRIGGER trg_catalog_boards_updated_at BEFORE UPDATE ON public.catalog_boards
  FOR EACH ROW EXECUTE FUNCTION public.catalog_set_updated_at();

CREATE TABLE public.catalog_board_aliases (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   uuid NOT NULL REFERENCES public.catalog_boards(id) ON DELETE CASCADE,
  alias      text NOT NULL CHECK (char_length(alias) <= 100),
  alias_norm text GENERATED ALWAYS AS (public.catalog_normalize(alias)) STORED,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_board_aliases_alias_norm_not_null CHECK (alias_norm IS NOT NULL),
  CONSTRAINT catalog_board_aliases_alias_norm_key UNIQUE (alias_norm)
);
COMMENT ON TABLE public.catalog_board_aliases IS '기기 마스터: 보드 별칭';
CREATE INDEX catalog_board_aliases_alias_norm_trgm ON public.catalog_board_aliases USING gin (alias_norm extensions.gin_trgm_ops);
CREATE INDEX catalog_board_aliases_board_idx ON public.catalog_board_aliases (board_id);
CREATE INDEX catalog_board_aliases_created_by_idx ON public.catalog_board_aliases (created_by);

CREATE TABLE public.catalog_model_boards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id   uuid NOT NULL REFERENCES public.catalog_models(id) ON DELETE CASCADE,
  variant_id uuid,
  board_id   uuid NOT NULL REFERENCES public.catalog_boards(id) ON DELETE CASCADE,
  note       text,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_model_boards_key UNIQUE NULLS NOT DISTINCT (model_id, variant_id, board_id),
  CONSTRAINT catalog_model_boards_variant_fk FOREIGN KEY (variant_id, model_id)
    REFERENCES public.catalog_variants(id, model_id) ON DELETE CASCADE
);
COMMENT ON TABLE public.catalog_model_boards IS '기기 마스터: 모델/변형 ↔ 보드 (다대다)';
CREATE INDEX catalog_model_boards_board_idx ON public.catalog_model_boards (board_id);
CREATE INDEX catalog_model_boards_variant_idx ON public.catalog_model_boards (variant_id, model_id);
CREATE INDEX catalog_model_boards_created_by_idx ON public.catalog_model_boards (created_by);

CREATE TABLE public.catalog_ticket_link_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      uuid NOT NULL REFERENCES public.repair_tickets(id) ON DELETE CASCADE,
  action         text NOT NULL CHECK (action IN ('link', 'unlink')),
  alias_id       uuid REFERENCES public.catalog_model_aliases(id) ON DELETE SET NULL,
  old_model_id   uuid,
  old_variant_id uuid,
  new_model_id   uuid,
  new_variant_id uuid,
  done_by        uuid,
  done_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.catalog_ticket_link_log IS '매핑 도구로 접수건-표준모델 연결/해제한 기록 (RPC 전용)';
CREATE INDEX catalog_ticket_link_log_ticket_idx ON public.catalog_ticket_link_log (ticket_id);
CREATE INDEX catalog_ticket_link_log_alias_idx ON public.catalog_ticket_link_log (alias_id);

-- ---------- 4. repair_tickets: nullable links ----------
ALTER TABLE public.repair_tickets
  ADD COLUMN catalog_model_id   uuid,
  ADD COLUMN catalog_variant_id uuid,
  ADD COLUMN catalog_board_id   uuid;

ALTER TABLE public.repair_tickets
  ADD CONSTRAINT repair_tickets_catalog_model_fk FOREIGN KEY (catalog_model_id)
    REFERENCES public.catalog_models(id) ON DELETE RESTRICT,
  ADD CONSTRAINT repair_tickets_catalog_variant_fk FOREIGN KEY (catalog_variant_id, catalog_model_id)
    REFERENCES public.catalog_variants(id, model_id) ON DELETE RESTRICT,
  ADD CONSTRAINT repair_tickets_catalog_board_fk FOREIGN KEY (catalog_board_id)
    REFERENCES public.catalog_boards(id) ON DELETE RESTRICT,
  ADD CONSTRAINT repair_tickets_catalog_variant_needs_model
    CHECK (catalog_variant_id IS NULL OR catalog_model_id IS NOT NULL);

CREATE INDEX repair_tickets_catalog_model_idx ON public.repair_tickets (catalog_model_id);
CREATE INDEX repair_tickets_catalog_variant_idx ON public.repair_tickets (catalog_variant_id, catalog_model_id);
CREATE INDEX repair_tickets_catalog_board_idx ON public.repair_tickets (catalog_board_id);

COMMENT ON COLUMN public.repair_tickets.catalog_model_id IS '표준 모델 (catalog_models). device_model 자유입력은 그대로 유지';
COMMENT ON COLUMN public.repair_tickets.catalog_variant_id IS '표준 모델 변형 (catalog_variants, 모델에 속해야 함)';
COMMENT ON COLUMN public.repair_tickets.catalog_board_id IS '메인보드 번호 (catalog_boards)';

-- ---------- 4b. protect_approved_ticket: narrow bypass for catalog links (Amendment A) ----------
-- Existing function (baseline) copied verbatim; only the catalog_link_sync block is added.
-- KI-9 (current_role keyword) is intentionally NOT fixed here. ACL is kept by CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION "public"."protect_approved_ticket"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_role employee_role;
  new_other repair_tickets;
BEGIN
  IF OLD.is_approved = FALSE THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.refund_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- 기기 마스터 매핑 RPC: 표준 모델 연결 컬럼만 바뀌는 경우에만 통과 (Phase 1, Amendment A)
  IF current_setting('app.catalog_link_sync', true) = 'on' THEN
    new_other := NEW;
    new_other.catalog_model_id   := OLD.catalog_model_id;
    new_other.catalog_variant_id := OLD.catalog_variant_id;
    new_other.catalog_board_id   := OLD.catalog_board_id;
    new_other.updated_at         := OLD.updated_at;
    IF new_other IS NOT DISTINCT FROM OLD THEN
      RETURN NEW;
    END IF;
  END IF;

  new_other := NEW;
  new_other.has_admin_message := OLD.has_admin_message;
  new_other.updated_at := OLD.updated_at;
  IF new_other IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  SELECT role INTO current_role
  FROM employees
  WHERE id = auth.uid();

  IF current_role = 'ADMIN' THEN
    RETURN NEW;
  END IF;

  IF current_role = 'MANAGER' THEN
    IF NEW.final_price <> OLD.final_price THEN
      RAISE EXCEPTION '승인 완료된 접수건의 금액은 수정할 수 없습니다.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '승인 완료된 접수건은 수정할 수 없습니다. (권한: %)' , current_role;
END;
$$;



-- ---------- 5. keep updated_at during mapping backfill ----------
-- 매핑 RPC 안에서만 app.catalog_link_sync = on → "최종 수정" 시각을 바꾸지 않는다.
-- 이름이 trg_repair_tickets_updated_at 보다 뒤에 정렬되어 마지막에 실행된다.
CREATE FUNCTION public.catalog_keep_ticket_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  IF current_setting('app.catalog_link_sync', true) = 'on' THEN
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_zz_catalog_keep_updated_at BEFORE UPDATE ON public.repair_tickets
  FOR EACH ROW EXECUTE FUNCTION public.catalog_keep_ticket_updated_at();

-- ---------- 6. RLS ----------
ALTER TABLE public.catalog_brands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_models          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_variants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_model_aliases   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_boards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_board_aliases   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_model_boards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_ticket_link_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['catalog_brands', 'catalog_models', 'catalog_variants', 'catalog_model_aliases',
                           'catalog_boards', 'catalog_board_aliases', 'catalog_model_boards'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.get_my_role() = ''ADMIN''::public.employee_role)', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.get_my_role() = ''ADMIN''::public.employee_role) WITH CHECK (public.get_my_role() = ''ADMIN''::public.employee_role)', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.get_my_role() = ''ADMIN''::public.employee_role)', t || '_delete', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END;
$$;

CREATE POLICY catalog_ticket_link_log_select ON public.catalog_ticket_link_log
  FOR SELECT TO authenticated USING (public.get_my_role() = 'ADMIN'::public.employee_role);
REVOKE ALL ON public.catalog_ticket_link_log FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.catalog_ticket_link_log FROM authenticated;

-- ---------- 7. RPCs ----------

-- 7.1 모델 검색 (호출자 권한, RLS 적용)
CREATE FUNCTION public.catalog_search_models(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (model_id uuid, variant_id uuid, brand_name text, model_name text, variant_name text, matched text, score real)
  LANGUAGE sql STABLE
  SET search_path = public, extensions
AS $$
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
$$;
COMMENT ON FUNCTION public.catalog_search_models(text, integer) IS '표준 모델 검색 (별칭/모델명, 부분일치 + 유사도)';

-- 7.2 보드 검색
CREATE FUNCTION public.catalog_search_boards(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (board_id uuid, board_number text, manufacturer text, matched text, score real)
  LANGUAGE sql STABLE
  SET search_path = public, extensions
AS $$
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
$$;
COMMENT ON FUNCTION public.catalog_search_boards(text, integer) IS '메인보드 검색 (보드번호/별칭, 부분일치 + 유사도)';

-- 7.3 인라인 모델 등록 (CS 제외 전 직원)
CREATE FUNCTION public.catalog_create_model(p_brand text, p_model text, p_device_type public.device_type DEFAULT NULL,
                                            p_variant text DEFAULT NULL)
RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role       employee_role := get_my_role();
  v_brand_norm text := catalog_normalize(p_brand);
  v_model_norm text := catalog_normalize(p_model);
  v_brand_id   uuid;
  v_model_id   uuid;
  v_variant_id uuid;
  v_existed    boolean := false;
BEGIN
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
$$;
COMMENT ON FUNCTION public.catalog_create_model(text, text, public.device_type, text) IS '인라인 새 모델 등록 (CS 제외). 관리자 외 등록은 needs_review';

-- 7.4 미연결 모델 문자열 목록 (ADMIN)
CREATE FUNCTION public.catalog_unmapped_model_strings(p_limit integer DEFAULT 200)
RETURNS TABLE (norm text, raw_strings text[], brands text[], ticket_count integer, test_count integer, suggestions jsonb)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public, extensions
AS $$
#variable_conflict use_column
BEGIN
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
$$;
COMMENT ON FUNCTION public.catalog_unmapped_model_strings(integer) IS '표준 모델 미연결 접수건의 모델 문자열 묶음 + 후보 (ADMIN, 고객정보 없음)';

-- 7.5 모델 문자열 → 표준 모델 연결 + 일괄 백필 (ADMIN, 단일 트랜잭션)
CREATE FUNCTION public.catalog_map_model_string(p_norm text, p_model_id uuid, p_variant_id uuid DEFAULT NULL,
                                                p_alias text DEFAULT NULL)
RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_norm       text := catalog_normalize(p_norm);
  v_alias      text := coalesce(nullif(trim(p_alias), ''), trim(p_norm));
  v_alias_id   uuid;
  v_alias_mid  uuid;
  v_alias_vid  uuid;
  v_linked     integer;
BEGIN
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
$$;
COMMENT ON FUNCTION public.catalog_map_model_string(text, uuid, uuid, text) IS '모델 문자열 → 표준 모델 연결: 별칭 생성 + 미연결 접수건 백필 + 기록 (ADMIN, 단일 트랜잭션, updated_at 유지)';

-- 7.6 연결 되돌리기 (ADMIN)
CREATE FUNCTION public.catalog_unmap_alias(p_alias_id uuid)
RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_source   text;
  v_unlinked integer;
BEGIN
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
$$;
COMMENT ON FUNCTION public.catalog_unmap_alias(uuid) IS '매핑 되돌리기: 해당 별칭으로 연결된(이후 변경 없는) 접수건 해제 + 기록, mapping 별칭 삭제 (ADMIN)';

-- ---------- 8. function privileges ----------
REVOKE ALL ON FUNCTION public.catalog_normalize(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_keep_ticket_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_search_models(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_search_boards(text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_create_model(text, text, public.device_type, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_unmapped_model_strings(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_map_model_string(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_unmap_alias(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.catalog_normalize(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_search_models(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_search_boards(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.catalog_create_model(text, text, public.device_type, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_unmapped_model_strings(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_map_model_string(text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_unmap_alias(uuid) TO authenticated;
