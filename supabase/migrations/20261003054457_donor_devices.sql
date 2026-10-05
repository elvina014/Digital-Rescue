-- =============================================================
-- Phase 4 — Donor devices (Donor 기기)
-- Plan: docs/repair-intelligence/phases/phase-4-plan.md (APPROVED 2026-10-03)
--
-- New tables, one view, one private storage bucket (+ policies) and two RPCs.
-- No existing table column, trigger, function, policy or view is changed.
-- Existing functions are only called: ri_inbound_extracted_part (Phase 2), repair_set_updated_at (Phase 2, trigger).
-- Rollback SQL: see the plan §5 / phase-4-report.md.
-- =============================================================

-- ---------- 1. tables ----------
CREATE SEQUENCE public.donor_no_seq;

CREATE TABLE public.donor_devices (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_no             text NOT NULL DEFAULT ('D-' || lpad(nextval('public.donor_no_seq')::text, 4, '0')),
  source_ticket_id     uuid NOT NULL REFERENCES public.repair_tickets(id) ON DELETE RESTRICT,
  device_type          public.device_type NOT NULL,
  brand                text NOT NULL CHECK (char_length(btrim(brand)) BETWEEN 1 AND 50),
  model_text           text CHECK (model_text IS NULL OR char_length(model_text) <= 150),
  tag_info             text CHECK (tag_info IS NULL OR char_length(tag_info) <= 150),
  catalog_model_id     uuid REFERENCES public.catalog_models(id) ON DELETE RESTRICT,
  catalog_variant_id   uuid,
  catalog_board_id     uuid REFERENCES public.catalog_boards(id) ON DELETE RESTRICT,
  status               text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'DEPLETED', 'SCRAPPED')),
  condition_note       text,
  storage_note         text CHECK (storage_note IS NULL OR char_length(storage_note) <= 100),
  consent_confirmed_by uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  consent_confirmed_at timestamptz NOT NULL,
  created_by           uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT donor_devices_donor_no_key UNIQUE (donor_no),
  CONSTRAINT donor_devices_source_ticket_key UNIQUE (source_ticket_id),
  CONSTRAINT donor_devices_variant_needs_model CHECK (catalog_variant_id IS NULL OR catalog_model_id IS NOT NULL),
  CONSTRAINT donor_devices_variant_fk FOREIGN KEY (catalog_variant_id, catalog_model_id)
    REFERENCES public.catalog_variants(id, model_id) ON DELETE RESTRICT
);
ALTER SEQUENCE public.donor_no_seq OWNED BY public.donor_devices.donor_no;
COMMENT ON TABLE public.donor_devices IS 'Donor 기기: 고객이 소유권을 포기(폐기 위임)한 기기를 부품 공급원으로 보관. 고객 정보 없음';
COMMENT ON COLUMN public.donor_devices.donor_no IS '임시 관리 번호 (D-0001). 라벨은 Phase 7';
COMMENT ON COLUMN public.donor_devices.status IS 'AVAILABLE 보관중 / DEPLETED 적출 완료 / SCRAPPED 폐기';
COMMENT ON COLUMN public.donor_devices.consent_confirmed_by IS '소유권 포기 동의를 확인한 직원';
CREATE INDEX donor_devices_model_idx      ON public.donor_devices (catalog_model_id);
CREATE INDEX donor_devices_variant_idx    ON public.donor_devices (catalog_variant_id, catalog_model_id);
CREATE INDEX donor_devices_board_idx      ON public.donor_devices (catalog_board_id);
CREATE INDEX donor_devices_consent_by_idx ON public.donor_devices (consent_confirmed_by);
CREATE INDEX donor_devices_created_by_idx ON public.donor_devices (created_by);
CREATE TRIGGER trg_donor_devices_updated_at BEFORE UPDATE ON public.donor_devices
  FOR EACH ROW EXECUTE FUNCTION public.repair_set_updated_at();

CREATE TABLE public.donor_part_candidates (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id               uuid NOT NULL REFERENCES public.donor_devices(id) ON DELETE RESTRICT,
  description            text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 200),
  part_spec_id           uuid REFERENCES public.part_specs(id) ON DELETE RESTRICT,
  quantity               integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  condition_estimate     text NOT NULL DEFAULT 'UNTESTED' CHECK (condition_estimate IN ('GOOD', 'UNTESTED', 'FAULTY')),
  status                 text NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'REQUESTED', 'EXTRACTED', 'UNUSABLE')),
  note                   text,
  category_id            uuid REFERENCES public.inventory_categories(id) ON DELETE RESTRICT,
  return_spec            text,
  return_name            text,
  return_capacity        text CHECK (return_capacity IS NULL OR char_length(return_capacity) <= 50),
  extracted_at           timestamptz,
  extracted_by           uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  inventory_item_id      uuid REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  source_removed_part_id uuid REFERENCES public.ticket_removed_parts(id) ON DELETE SET NULL,
  created_by             uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT donor_part_candidates_inbound_fields CHECK (
    status NOT IN ('REQUESTED', 'EXTRACTED')
    OR (category_id IS NOT NULL AND NULLIF(btrim(return_spec), '') IS NOT NULL AND NULLIF(btrim(return_name), '') IS NOT NULL)),
  CONSTRAINT donor_part_candidates_extracted_stamp CHECK ((status = 'EXTRACTED') = (extracted_at IS NOT NULL))
);
COMMENT ON TABLE public.donor_part_candidates IS 'Donor 기기의 적출 후보 부품 (잠재 재고). 실제 재고는 적출 입고 시 inventory_items에 기록';
COMMENT ON COLUMN public.donor_part_candidates.status IS 'AVAILABLE 적출 가능 / REQUESTED 적출 입고 요청 / EXTRACTED 입고 완료 / UNUSABLE 사용 불가';
COMMENT ON COLUMN public.donor_part_candidates.condition_estimate IS 'GOOD 양호 / UNTESTED 미확인 / FAULTY 불량';
COMMENT ON COLUMN public.donor_part_candidates.extracted_at IS '적출 입고 시각 (RPC 전용)';
CREATE INDEX donor_part_candidates_donor_idx        ON public.donor_part_candidates (donor_id);
CREATE INDEX donor_part_candidates_spec_idx         ON public.donor_part_candidates (part_spec_id);
CREATE INDEX donor_part_candidates_category_idx     ON public.donor_part_candidates (category_id);
CREATE INDEX donor_part_candidates_extracted_by_idx ON public.donor_part_candidates (extracted_by);
CREATE INDEX donor_part_candidates_item_idx         ON public.donor_part_candidates (inventory_item_id);
CREATE INDEX donor_part_candidates_removed_idx      ON public.donor_part_candidates (source_removed_part_id);
CREATE INDEX donor_part_candidates_created_by_idx   ON public.donor_part_candidates (created_by);
CREATE TRIGGER trg_donor_part_candidates_updated_at BEFORE UPDATE ON public.donor_part_candidates
  FOR EACH ROW EXECUTE FUNCTION public.repair_set_updated_at();

CREATE TABLE public.donor_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id    uuid NOT NULL REFERENCES public.donor_devices(id) ON DELETE CASCADE,
  path        text NOT NULL CHECK (char_length(path) BETWEEN 1 AND 300),
  description text CHECK (description IS NULL OR char_length(description) <= 200),
  uploaded_by uuid DEFAULT auth.uid() REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT donor_photos_path_key UNIQUE (path)
);
COMMENT ON TABLE public.donor_photos IS 'Donor 기기 사진 (비공개 버킷 donor-photos, 접수 이미지와 별도)';
CREATE INDEX donor_photos_donor_idx       ON public.donor_photos (donor_id);
CREATE INDEX donor_photos_uploaded_by_idx ON public.donor_photos (uploaded_by);

-- ---------- 2. RLS ----------
ALTER TABLE public.donor_devices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_part_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_photos          ENABLE ROW LEVEL SECURITY;

-- Donor 기기: 전 직원 조회, 생성은 RPC 전용, 수정은 관리자/팀장 (허용 컬럼만)
CREATE POLICY donor_devices_select ON public.donor_devices FOR SELECT TO authenticated USING (true);
CREATE POLICY donor_devices_update ON public.donor_devices FOR UPDATE TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role]))
  WITH CHECK (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role]));
REVOKE ALL ON public.donor_devices FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.donor_devices FROM authenticated;
GRANT UPDATE (brand, model_text, tag_info, catalog_model_id, catalog_variant_id, catalog_board_id, status, condition_note, storage_note)
  ON public.donor_devices TO authenticated;

-- 적출 후보: 관리자/팀장/기사/정밀수리팀. 입고 완료(EXTRACTED) 행은 누구도 수정·삭제 불가, EXTRACTED 설정은 RPC 전용
CREATE POLICY donor_part_candidates_select ON public.donor_part_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY donor_part_candidates_insert ON public.donor_part_candidates FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role,
                                                'TECHNICIAN'::public.employee_role, 'EXPERT_REPAIR'::public.employee_role])
              AND status <> 'EXTRACTED'
              AND EXISTS (SELECT 1 FROM public.donor_devices d WHERE d.id = donor_id AND d.status = 'AVAILABLE'));
CREATE POLICY donor_part_candidates_update ON public.donor_part_candidates FOR UPDATE TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role,
                                           'TECHNICIAN'::public.employee_role, 'EXPERT_REPAIR'::public.employee_role])
         AND status <> 'EXTRACTED')
  WITH CHECK (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role,
                                                'TECHNICIAN'::public.employee_role, 'EXPERT_REPAIR'::public.employee_role])
              AND status <> 'EXTRACTED');
CREATE POLICY donor_part_candidates_delete ON public.donor_part_candidates FOR DELETE TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role,
                                           'TECHNICIAN'::public.employee_role, 'EXPERT_REPAIR'::public.employee_role])
         AND status IN ('AVAILABLE', 'UNUSABLE'));
REVOKE ALL ON public.donor_part_candidates FROM anon;
REVOKE INSERT, UPDATE, TRUNCATE ON public.donor_part_candidates FROM authenticated;
GRANT INSERT (donor_id, description, part_spec_id, quantity, condition_estimate, status, note,
              category_id, return_spec, return_name, return_capacity)
  ON public.donor_part_candidates TO authenticated;
GRANT UPDATE (description, part_spec_id, quantity, condition_estimate, status, note,
              category_id, return_spec, return_name, return_capacity)
  ON public.donor_part_candidates TO authenticated;

-- 사진: 전 직원 조회, 등록은 관리자/팀장/기사/정밀수리팀, 삭제는 관리자/팀장
CREATE POLICY donor_photos_select ON public.donor_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY donor_photos_insert ON public.donor_photos FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role,
                                                'TECHNICIAN'::public.employee_role, 'EXPERT_REPAIR'::public.employee_role]));
CREATE POLICY donor_photos_delete ON public.donor_photos FOR DELETE TO authenticated
  USING (public.get_my_role() = ANY (ARRAY['ADMIN'::public.employee_role, 'MANAGER'::public.employee_role]));
REVOKE ALL ON public.donor_photos FROM anon;
REVOKE INSERT, UPDATE, TRUNCATE ON public.donor_photos FROM authenticated;
GRANT INSERT (donor_id, path, description) ON public.donor_photos TO authenticated;

REVOKE ALL ON SEQUENCE public.donor_no_seq FROM PUBLIC, anon, authenticated;

-- ---------- 3. view: potential stock ----------
CREATE VIEW public.donor_potential_stock WITH (security_invoker = true) AS
  SELECT c.id AS candidate_id, c.description, c.quantity, c.condition_estimate, c.status AS candidate_status, c.note,
         c.part_spec_id, ps.part_type, ps.name AS part_name,
         ic.name AS category_name,
         d.id AS donor_id, d.donor_no, d.device_type, d.brand, d.model_text,
         CASE WHEN cm.id IS NOT NULL THEN concat_ws(' ', br.name, cm.name, cv.name) END AS catalog_model_label,
         cb.board_number,
         d.storage_note,
         c.created_at
    FROM public.donor_part_candidates c
    JOIN public.donor_devices d ON d.id = c.donor_id
    LEFT JOIN public.part_specs ps ON ps.id = c.part_spec_id
    LEFT JOIN public.inventory_categories ic ON ic.id = c.category_id
    LEFT JOIN public.catalog_models cm ON cm.id = d.catalog_model_id
    LEFT JOIN public.catalog_brands br ON br.id = cm.brand_id
    LEFT JOIN public.catalog_variants cv ON cv.id = d.catalog_variant_id
    LEFT JOIN public.catalog_boards cb ON cb.id = d.catalog_board_id
   WHERE c.status IN ('AVAILABLE', 'REQUESTED')
     AND d.status = 'AVAILABLE';
COMMENT ON VIEW public.donor_potential_stock IS '잠재 재고: 보관 중인 Donor 기기의 적출 가능 부품 (고객 정보·접수 ID 없음)';
REVOKE ALL ON public.donor_potential_stock FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.donor_potential_stock FROM authenticated;

-- ---------- 4. storage: private bucket for donor photos ----------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('donor-photos', 'donor-photos', false, 10485760, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY donor_photos_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'donor-photos' AND public.get_my_role() IS NOT NULL);
CREATE POLICY donor_photos_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'donor-photos'
              AND (public.get_my_role())::text = ANY (ARRAY['ADMIN', 'MANAGER', 'TECHNICIAN', 'EXPERT_REPAIR']));
CREATE POLICY donor_photos_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'donor-photos' AND (public.get_my_role())::text = ANY (ARRAY['ADMIN', 'MANAGER']));

-- ---------- 5. functions ----------

-- 5.1 폐기 확인 대기 접수건 → Donor 전환 (관리자/팀장, 소유권 포기 동의 확인 필수)
CREATE FUNCTION public.donor_convert_from_ticket(
  p_ticket_id uuid, p_consent boolean, p_brand text, p_model_text text,
  p_tag_info text DEFAULT NULL, p_condition_note text DEFAULT NULL, p_storage_note text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role   employee_role := get_my_role();
  v_ticket repair_tickets;
  v_brand  text := btrim(coalesce(p_brand, ''));
  v_donor  donor_devices;
  v_copied integer;
BEGIN
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
$$;
COMMENT ON FUNCTION public.donor_convert_from_ticket(uuid, boolean, text, text, text, text, text) IS
  '폐기 확인 대기 접수건을 Donor 기기로 전환 (ADMIN/MANAGER, 동의 확인 필수): Donor 생성 + Donor유지 부품 후보화 + 폐기 확인 + 로그, 단일 트랜잭션';

-- 5.2 적출 입고 (관리자/팀장): 기존 적출품 입고 함수로 재고 반영 + 후보 입고 완료, 단일 트랜잭션
CREATE FUNCTION public.donor_extract_part(
  p_candidate_id uuid, p_category_id uuid DEFAULT NULL, p_spec text DEFAULT NULL,
  p_name text DEFAULT NULL, p_capacity text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
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
$$;
COMMENT ON FUNCTION public.donor_extract_part(uuid, uuid, text, text, text) IS
  'Donor 후보 부품 적출 입고 (ADMIN/MANAGER): ri_inbound_extracted_part로 중고 재고 + INBOUND, 후보 입고 완료 — 단일 트랜잭션';

-- ---------- 6. function privileges ----------
REVOKE ALL ON FUNCTION public.donor_convert_from_ticket(uuid, boolean, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.donor_extract_part(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.donor_convert_from_ticket(uuid, boolean, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.donor_extract_part(uuid, uuid, text, text, text) TO authenticated;
