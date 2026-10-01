-- =============================================================
-- Phase 3 — Part knowledge & compatibility (부품 규격 · 호환성)
-- Plan: docs/repair-intelligence/phases/phase-3-plan.md (APPROVED 2026-10-02)
--
-- New tables, one view, RPCs and two nullable columns (inventory_items, ticket_removed_parts).
-- No existing trigger, function, policy or view is changed.
-- Rollback SQL: see the plan §5 / phase-3-report.md.
-- =============================================================

-- ---------- 1. helper ----------
CREATE FUNCTION public.part_set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------- 2. tables ----------
CREATE TABLE public.interchange_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  note       text,
  created_by uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interchange_groups_name_key UNIQUE (name)
);
COMMENT ON TABLE public.interchange_groups IS '호환 그룹: 서로 대체 가능한 부품 규격 묶음 (추정 후보의 근거)';
CREATE INDEX interchange_groups_created_by_idx ON public.interchange_groups (created_by);

CREATE TABLE public.part_specs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_type            text NOT NULL CHECK (part_type IN ('PANEL', 'BATTERY', 'KEYBOARD', 'IC', 'STORAGE', 'MEMORY',
                                                          'MAINBOARD', 'CABLE', 'FAN', 'CASE', 'ADAPTER', 'OTHER')),
  name                 text NOT NULL CHECK (char_length(name) <= 150),
  name_norm            text GENERATED ALWAYS AS (public.catalog_normalize(name)) STORED,
  manufacturer         text CHECK (manufacturer IS NULL OR char_length(manufacturer) <= 50),
  compat_target        text NOT NULL CHECK (compat_target IN ('MODEL', 'BOARD')),
  interchange_group_id uuid REFERENCES public.interchange_groups(id) ON DELETE SET NULL,
  description          text,
  needs_review         boolean NOT NULL DEFAULT false,
  created_by           uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_specs_name_norm_not_null CHECK (name_norm IS NOT NULL),
  CONSTRAINT part_specs_type_name_key UNIQUE (part_type, name_norm)
);
COMMENT ON TABLE public.part_specs IS '부품 규격 (부품이 무엇인지). 실물 재고는 inventory_items — inventory_specs(세부 분류)와 다른 개념';
COMMENT ON COLUMN public.part_specs.name IS '대표 품번/명칭 (예: LP140WF7-SPB1, BQ24780S)';
COMMENT ON COLUMN public.part_specs.compat_target IS '호환 기준: MODEL 모델/변형, BOARD 메인보드 (칩/IC)';
COMMENT ON COLUMN public.part_specs.needs_review IS '관리자 외 직원이 인라인 등록한 규격 — 관리자 검토 필요';
CREATE INDEX part_specs_name_norm_trgm ON public.part_specs USING gin (name_norm extensions.gin_trgm_ops);
CREATE INDEX part_specs_group_idx ON public.part_specs (interchange_group_id);
CREATE INDEX part_specs_created_by_idx ON public.part_specs (created_by);
CREATE TRIGGER trg_part_specs_updated_at BEFORE UPDATE ON public.part_specs
  FOR EACH ROW EXECUTE FUNCTION public.part_set_updated_at();

CREATE TABLE public.part_number_aliases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_spec_id uuid NOT NULL REFERENCES public.part_specs(id) ON DELETE CASCADE,
  alias        text NOT NULL CHECK (char_length(alias) <= 150),
  alias_norm   text GENERATED ALWAYS AS (public.catalog_normalize(alias)) STORED,
  alias_type   text NOT NULL DEFAULT 'PART_NUMBER' CHECK (alias_type IN ('PART_NUMBER', 'MARKING', 'OTHER')),
  created_by   uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_number_aliases_alias_norm_not_null CHECK (alias_norm IS NOT NULL),
  CONSTRAINT part_number_aliases_spec_alias_key UNIQUE (part_spec_id, alias_norm)
);
COMMENT ON TABLE public.part_number_aliases IS '부품 규격 별칭: 품번, 칩 마킹 등 (규격별 유일 — 같은 마킹이 다른 부품에도 있을 수 있음)';
CREATE INDEX part_number_aliases_alias_norm_trgm ON public.part_number_aliases USING gin (alias_norm extensions.gin_trgm_ops);
CREATE INDEX part_number_aliases_created_by_idx ON public.part_number_aliases (created_by);

CREATE TABLE public.part_compatibility (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_spec_id     uuid NOT NULL REFERENCES public.part_specs(id) ON DELETE RESTRICT,
  model_id         uuid REFERENCES public.catalog_models(id) ON DELETE RESTRICT,
  variant_id       uuid REFERENCES public.catalog_variants(id) ON DELETE RESTRICT,
  board_id         uuid REFERENCES public.catalog_boards(id) ON DELETE RESTRICT,
  status           text NOT NULL DEFAULT 'unknown' CHECK (status IN ('compatible', 'conditional', 'incompatible', 'unknown')),
  confidence       text NOT NULL DEFAULT 'inferred' CHECK (confidence IN ('verified', 'documented', 'inferred')),
  limitation_note  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT part_compatibility_one_target CHECK (num_nonnulls(model_id, variant_id, board_id) = 1),
  CONSTRAINT part_compatibility_conditional_note CHECK (status <> 'conditional' OR NULLIF(btrim(limitation_note), '') IS NOT NULL)
);
COMMENT ON TABLE public.part_compatibility IS '부품 규격 ↔ 대상(모델/변형/보드 중 하나) 호환성. 상태·신뢰도는 근거(compatibility_evidence)에서 계산 — 직접 수정 불가';
COMMENT ON COLUMN public.part_compatibility.status IS 'compatible 호환 / conditional 조건부 / incompatible 비호환 / unknown 미확인';
COMMENT ON COLUMN public.part_compatibility.confidence IS 'verified 실장 확인(사람) / documented 문서 근거 / inferred 추정';
CREATE UNIQUE INDEX part_compatibility_spec_model_key   ON public.part_compatibility (part_spec_id, model_id)   WHERE model_id IS NOT NULL;
CREATE UNIQUE INDEX part_compatibility_spec_variant_key ON public.part_compatibility (part_spec_id, variant_id) WHERE variant_id IS NOT NULL;
CREATE UNIQUE INDEX part_compatibility_spec_board_key   ON public.part_compatibility (part_spec_id, board_id)   WHERE board_id IS NOT NULL;
CREATE INDEX part_compatibility_model_idx   ON public.part_compatibility (model_id);
CREATE INDEX part_compatibility_variant_idx ON public.part_compatibility (variant_id);
CREATE INDEX part_compatibility_board_idx   ON public.part_compatibility (board_id);

CREATE TABLE public.compatibility_evidence (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compatibility_id   uuid NOT NULL REFERENCES public.part_compatibility(id) ON DELETE RESTRICT,
  kind               text NOT NULL CHECK (kind IN ('INSTALL', 'DOCUMENT', 'INFERENCE', 'OVERRIDE')),
  observed_status    text NOT NULL CHECK (observed_status IN ('compatible', 'conditional', 'incompatible')),
  limitation_note    text,
  ticket_id          uuid REFERENCES public.repair_tickets(id) ON DELETE RESTRICT,
  ticket_material_id uuid REFERENCES public.ticket_materials(id) ON DELETE SET NULL,
  reference          text,
  note               text,
  created_by         uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at         timestamptz NOT NULL DEFAULT now(),
  retracted_at       timestamptz,
  retracted_by       uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  retract_reason     text,
  CONSTRAINT compatibility_evidence_conditional_note CHECK (observed_status <> 'conditional' OR NULLIF(btrim(limitation_note), '') IS NOT NULL),
  CONSTRAINT compatibility_evidence_document_reference CHECK (kind <> 'DOCUMENT' OR NULLIF(btrim(reference), '') IS NOT NULL),
  CONSTRAINT compatibility_evidence_override_reason CHECK (kind <> 'OVERRIDE' OR NULLIF(btrim(note), '') IS NOT NULL)
);
COMMENT ON TABLE public.compatibility_evidence IS '호환성 근거 이력 (삭제·수정 없음, 철회만). INSTALL 실장 확인 / DOCUMENT 문서 / INFERENCE 추정 / OVERRIDE 관리자 조정';
CREATE UNIQUE INDEX compatibility_evidence_active_material_key ON public.compatibility_evidence (ticket_material_id)
  WHERE retracted_at IS NULL AND ticket_material_id IS NOT NULL;
CREATE INDEX compatibility_evidence_compat_idx       ON public.compatibility_evidence (compatibility_id);
CREATE INDEX compatibility_evidence_ticket_idx       ON public.compatibility_evidence (ticket_id);
CREATE INDEX compatibility_evidence_material_idx     ON public.compatibility_evidence (ticket_material_id);
CREATE INDEX compatibility_evidence_created_by_idx   ON public.compatibility_evidence (created_by);
CREATE INDEX compatibility_evidence_retracted_by_idx ON public.compatibility_evidence (retracted_by);

-- ---------- 3. nullable links on existing tables ----------
ALTER TABLE public.inventory_items
  ADD COLUMN part_spec_id uuid REFERENCES public.part_specs(id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.inventory_items.part_spec_id IS '부품 규격 (part_specs) — 이 재고 행의 기본 규격';
CREATE INDEX inventory_items_part_spec_idx ON public.inventory_items (part_spec_id);

ALTER TABLE public.ticket_removed_parts
  ADD COLUMN part_spec_id uuid REFERENCES public.part_specs(id) ON DELETE RESTRICT;
COMMENT ON COLUMN public.ticket_removed_parts.part_spec_id IS '부품 규격 (part_specs) — 선택 사항';
CREATE INDEX ticket_removed_parts_part_spec_idx ON public.ticket_removed_parts (part_spec_id);
GRANT INSERT (part_spec_id), UPDATE (part_spec_id) ON public.ticket_removed_parts TO authenticated;

-- ---------- 4. RLS ----------
ALTER TABLE public.interchange_groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_specs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_number_aliases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.part_compatibility     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compatibility_evidence ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['interchange_groups', 'part_specs', 'part_number_aliases'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.get_my_role() = ''ADMIN''::public.employee_role)', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.get_my_role() = ''ADMIN''::public.employee_role) WITH CHECK (public.get_my_role() = ''ADMIN''::public.employee_role)', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.get_my_role() = ''ADMIN''::public.employee_role)', t || '_delete', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END;
$$;

-- 호환성·근거: 읽기만. 쓰기는 RPC 전용
CREATE POLICY part_compatibility_select ON public.part_compatibility FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.part_compatibility FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.part_compatibility FROM authenticated;

CREATE POLICY compatibility_evidence_select ON public.compatibility_evidence FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.compatibility_evidence FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.compatibility_evidence FROM authenticated;

-- ---------- 5. internal functions ----------

-- 5.1 근거로부터 상태·신뢰도 재계산 (같은 근거 집합 → 항상 같은 결과)
CREATE FUNCTION public.ri_recompute_compatibility(p_compatibility_id uuid) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
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
$$;
COMMENT ON FUNCTION public.ri_recompute_compatibility(uuid) IS '내부용: 유효 근거로부터 호환 상태·신뢰도 재계산';

-- 5.2 (규격, 대상) 호환성 행 찾기/만들기
CREATE FUNCTION public.ri_compatibility_row(p_part_spec_id uuid, p_target_type text, p_target_id uuid) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_compat_target text;
  v_id            uuid;
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
$$;
COMMENT ON FUNCTION public.ri_compatibility_row(uuid, text, uuid) IS '내부용: (부품 규격, 대상) 호환성 행 찾기/생성';

-- ---------- 6. RPCs ----------

-- 6.1 관리자 수동 근거 등록 (문서/추정/실장 확인/관리자 조정)
CREATE FUNCTION public.record_compatibility_result(
  p_part_spec_id uuid, p_target_type text, p_target_id uuid, p_kind text, p_observed_status text,
  p_limitation_note text DEFAULT NULL, p_reference text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_compat_id   uuid;
  v_evidence_id uuid;
  v_row         part_compatibility;
BEGIN
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
$$;
COMMENT ON FUNCTION public.record_compatibility_result(uuid, text, uuid, text, text, text, text, text)
  IS '호환성 근거 등록 + 재계산 (ADMIN). 관리자 조정(OVERRIDE)은 상태만 바꾸며 verified를 만들지 못한다';

-- 6.2 사용 부품별 실장 결과 응답 (수리 기록 수정 권한자)
CREATE FUNCTION public.record_part_install_result(
  p_material_id uuid, p_part_spec_id uuid, p_answer text, p_limitation_note text DEFAULT NULL,
  p_target_type text DEFAULT NULL, p_target_id uuid DEFAULT NULL)
RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
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
$$;
COMMENT ON FUNCTION public.record_part_install_result(uuid, uuid, text, text, text, uuid)
  IS '사용 부품 호환 확인 응답 (OK/CONDITIONAL/INCOMPATIBLE/UNKNOWN). UNKNOWN은 근거를 남기지 않는다';

-- 6.3 근거 철회 (ADMIN)
CREATE FUNCTION public.retract_compatibility_evidence(p_evidence_id uuid, p_reason text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_compat_id uuid;
  v_row       part_compatibility;
BEGIN
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
$$;
COMMENT ON FUNCTION public.retract_compatibility_evidence(uuid, text) IS '호환성 근거 철회 + 재계산 (ADMIN, 사유 필수)';

-- 6.4 인라인 부품 규격 등록 (CS 제외 전 직원)
CREATE FUNCTION public.part_spec_create(p_part_type text, p_name text, p_manufacturer text DEFAULT NULL,
                                        p_compat_target text DEFAULT NULL)
RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role    employee_role := get_my_role();
  v_norm    text := catalog_normalize(p_name);
  v_target  text := coalesce(NULLIF(btrim(p_compat_target), ''), CASE WHEN p_part_type = 'IC' THEN 'BOARD' ELSE 'MODEL' END);
  v_id      uuid;
  v_existed boolean := false;
BEGIN
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
$$;
COMMENT ON FUNCTION public.part_spec_create(text, text, text, text) IS '인라인 새 부품 규격 등록 (CS 제외). 관리자 외 등록은 needs_review';

-- 6.5 부품 규격 검색 (호출자 권한, RLS 적용)
CREATE FUNCTION public.part_spec_search(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (part_spec_id uuid, part_type text, name text, manufacturer text, compat_target text, matched text, score real)
  LANGUAGE sql STABLE
  SET search_path = public, extensions
AS $$
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
$$;
COMMENT ON FUNCTION public.part_spec_search(text, integer) IS '부품 규격 검색 (품번/마킹/별칭, 부분일치 + 유사도)';

-- ---------- 7. view: summary with evidence counts + interchange candidates ----------
CREATE VIEW public.compatibility_summary WITH (security_invoker = true) AS
  WITH direct AS (
    SELECT pc.id AS compatibility_id, pc.part_spec_id,
           CASE WHEN pc.model_id IS NOT NULL THEN 'MODEL' WHEN pc.variant_id IS NOT NULL THEN 'VARIANT' ELSE 'BOARD' END AS target_type,
           coalesce(pc.model_id, pc.variant_id, pc.board_id) AS target_id,
           pc.status, pc.confidence, pc.limitation_note
      FROM public.part_compatibility pc
  ),
  counts AS (
    SELECT e.compatibility_id,
           count(*) FILTER (WHERE e.kind = 'INSTALL' AND e.observed_status = 'compatible')::integer   AS install_ok,
           count(*) FILTER (WHERE e.kind = 'INSTALL' AND e.observed_status = 'conditional')::integer  AS install_conditional,
           count(*) FILTER (WHERE e.kind = 'INSTALL' AND e.observed_status = 'incompatible')::integer AS install_incompatible,
           count(*) FILTER (WHERE e.kind = 'DOCUMENT')::integer  AS document_count,
           count(*) FILTER (WHERE e.kind = 'INFERENCE')::integer AS inference_count,
           bool_or(e.kind = 'OVERRIDE') AS has_override,
           max(e.created_at) AS last_evidence_at
      FROM public.compatibility_evidence e
     WHERE e.retracted_at IS NULL
     GROUP BY e.compatibility_id
  ),
  -- 같은 호환 그룹의 다른 규격이 verified/documented 근거를 가진 대상 → 추정 후보 (저장하지 않음)
  candidates AS (
    SELECT b.id AS part_spec_id, d.target_type, d.target_id,
           CASE WHEN bool_and(d.status = 'compatible') THEN 'compatible' ELSE 'unknown' END AS status,
           format('동일 호환 그룹(%s)의 %s 기준 추정', g.name, string_agg(a.name, ', ' ORDER BY a.name)) AS limitation_note
      FROM direct d
      JOIN public.part_specs a ON a.id = d.part_spec_id
      JOIN public.interchange_groups g ON g.id = a.interchange_group_id
      JOIN public.part_specs b ON b.interchange_group_id = a.interchange_group_id AND b.id <> a.id AND b.compat_target = a.compat_target
     WHERE d.confidence IN ('verified', 'documented')
       AND NOT EXISTS (SELECT 1 FROM direct x
                        WHERE x.part_spec_id = b.id AND x.target_type = d.target_type AND x.target_id = d.target_id)
     GROUP BY b.id, d.target_type, d.target_id, g.name
  ),
  merged AS (
    SELECT d.compatibility_id, d.part_spec_id, d.target_type, d.target_id, d.status, d.confidence, d.limitation_note,
           coalesce(c.install_ok, 0) AS install_ok, coalesce(c.install_conditional, 0) AS install_conditional,
           coalesce(c.install_incompatible, 0) AS install_incompatible, coalesce(c.document_count, 0) AS document_count,
           coalesce(c.inference_count, 0) AS inference_count, coalesce(c.has_override, false) AS has_override,
           c.last_evidence_at, false AS is_candidate
      FROM direct d LEFT JOIN counts c ON c.compatibility_id = d.compatibility_id
    UNION ALL
    SELECT NULL::uuid, k.part_spec_id, k.target_type, k.target_id, k.status, 'inferred', k.limitation_note,
           0, 0, 0, 0, 0, false, NULL::timestamptz, true
      FROM candidates k
  )
  SELECT m.compatibility_id, m.part_spec_id, ps.part_type, ps.name AS part_name, ps.manufacturer,
         m.target_type, m.target_id,
         CASE m.target_type
           WHEN 'MODEL'   THEN (SELECT br.name || ' ' || cm.name FROM public.catalog_models cm
                                  JOIN public.catalog_brands br ON br.id = cm.brand_id WHERE cm.id = m.target_id)
           WHEN 'VARIANT' THEN (SELECT br.name || ' ' || cm.name || ' ' || cv.name FROM public.catalog_variants cv
                                  JOIN public.catalog_models cm ON cm.id = cv.model_id
                                  JOIN public.catalog_brands br ON br.id = cm.brand_id WHERE cv.id = m.target_id)
           ELSE (SELECT cb.board_number FROM public.catalog_boards cb WHERE cb.id = m.target_id)
         END AS target_label,
         m.status, m.confidence, m.limitation_note,
         m.install_ok, m.install_conditional, m.install_incompatible, m.document_count, m.inference_count,
         m.has_override, m.last_evidence_at, m.is_candidate
    FROM merged m
    JOIN public.part_specs ps ON ps.id = m.part_spec_id;
COMMENT ON VIEW public.compatibility_summary IS '호환성 요약: 상태·신뢰도·근거 건수 + 호환 그룹 기준 추정 후보(is_candidate)';
REVOKE ALL ON public.compatibility_summary FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.compatibility_summary FROM authenticated;

-- ---------- 8. function privileges ----------
REVOKE ALL ON FUNCTION public.part_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ri_recompute_compatibility(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ri_compatibility_row(uuid, text, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_compatibility_result(uuid, text, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_part_install_result(uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retract_compatibility_evidence(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_spec_create(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.part_spec_search(text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_compatibility_result(uuid, text, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_part_install_result(uuid, uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retract_compatibility_evidence(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.part_spec_create(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.part_spec_search(text, integer) TO authenticated;
