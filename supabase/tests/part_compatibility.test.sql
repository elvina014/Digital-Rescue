-- =============================================================
-- Phase 3 — part specs, compatibility, evidence
-- Run: npx supabase test db   (local only; everything is rolled back)
-- Seed users: a…01 ADMIN, 02 MANAGER, 03 RECEPTION, 04 TECHNICIAN, 05 EXPERT_REPAIR, 06 CS
-- Seed tickets: d…04 IN_PROGRESS (tech), 05 WAITING_APPROVAL (tech), 06 COMPLETED approved (expert), 07 CANCELED (tech)
-- Seed materials: e…01 pending (t4), 05 approved SSD (t5), 07 cancel_requested 외주 (t7)
-- Seed catalog: models f200…01/02/03, variant f300…01 (of model 02), boards f400…01/02
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT * FROM no_plan();

CREATE TEMP TABLE res (k text PRIMARY KEY, v jsonb);
GRANT ALL ON res TO authenticated, anon;

CREATE FUNCTION pg_temp.jwt(p_n text) RETURNS text LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-a000-00000000000' || p_n, 'role', 'authenticated')::text, true);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.jwt(text) TO authenticated, anon;

-- fixtures
INSERT INTO interchange_groups (id, name) VALUES
  ('00000000-0000-4000-9100-000000000001', '15.6 FHD 30핀'), ('00000000-0000-4000-9100-000000000002', 'NVMe 2280');
INSERT INTO part_specs (id, part_type, name, compat_target, interchange_group_id) VALUES
  ('00000000-0000-4000-9000-000000000001', 'PANEL',   'LP156WFC-SPD1', 'MODEL', '00000000-0000-4000-9100-000000000001'),
  ('00000000-0000-4000-9000-000000000002', 'PANEL',   'NV156FHM-N48',  'MODEL', '00000000-0000-4000-9100-000000000001'),
  ('00000000-0000-4000-9000-000000000003', 'PANEL',   'B156HAN02.1',   'MODEL', '00000000-0000-4000-9100-000000000001'),
  ('00000000-0000-4000-9000-000000000004', 'STORAGE', 'PM9A1 512GB',   'MODEL', '00000000-0000-4000-9100-000000000002'),
  ('00000000-0000-4000-9000-000000000005', 'STORAGE', 'SN740 512GB',   'MODEL', '00000000-0000-4000-9100-000000000002'),
  ('00000000-0000-4000-9000-000000000006', 'IC',      'BQ24780S',      'BOARD', NULL);

INSERT INTO inventory_categories (id, name) VALUES ('00000000-0000-4000-b100-0000000000aa', '소프트웨어');
INSERT INTO inventory_specs (id, category_id, name) VALUES ('00000000-0000-4000-b200-0000000000aa', '00000000-0000-4000-b100-0000000000aa', 'OS');
INSERT INTO inventory_products (id, spec_id, name) VALUES ('00000000-0000-4000-b300-0000000000aa', '00000000-0000-4000-b200-0000000000aa', '윈도우');
INSERT INTO inventory_items (id, category_id, spec_id, product_id, condition, quantity, base_estimate) VALUES
  ('00000000-0000-4000-b400-0000000000aa', '00000000-0000-4000-b100-0000000000aa', '00000000-0000-4000-b200-0000000000aa', '00000000-0000-4000-b300-0000000000aa', 'NEW', 5, 0);
INSERT INTO ticket_materials (id, ticket_id, inventory_item_id, quantity, request_status, request_type, created_by) VALUES
  ('00000000-0000-4000-e000-000000000031', '00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b400-000000000003', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004'),
  ('00000000-0000-4000-e000-000000000032', '00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b400-0000000000aa', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004');
-- t4 has a catalog link (model 02 + variant), t5 has none
UPDATE repair_tickets SET catalog_model_id = '00000000-0000-4000-f200-000000000002', catalog_variant_id = '00000000-0000-4000-f300-000000000001'
 WHERE id = '00000000-0000-4000-d000-000000000004';

-- ---------- 1. constraints (as owner) ----------
SELECT throws_ok($$ INSERT INTO part_specs (part_type, name, compat_target) VALUES ('PANEL', 'lp156wfc spd1', 'MODEL') $$,
  '23505', NULL, 'part spec unique per (type, normalised name)');
SELECT lives_ok($$ INSERT INTO part_specs (part_type, name, compat_target) VALUES ('OTHER', 'LP156WFC-SPD1', 'MODEL') $$,
  'same name allowed under another part type');
SELECT throws_ok($$ INSERT INTO part_specs (part_type, name, compat_target) VALUES ('SCREW', 'x', 'MODEL') $$, '23514', NULL, 'part_type CHECK');
SELECT throws_ok($$ INSERT INTO part_specs (part_type, name, compat_target) VALUES ('PANEL', '--', 'MODEL') $$, '23514', NULL, 'name must normalise to something');
INSERT INTO part_number_aliases (part_spec_id, alias, alias_type) VALUES ('00000000-0000-4000-9000-000000000006', 'BQ780S', 'MARKING');
SELECT throws_ok($$ INSERT INTO part_number_aliases (part_spec_id, alias) VALUES ('00000000-0000-4000-9000-000000000006', 'bq-780s') $$,
  '23505', NULL, 'alias unique per spec');
SELECT lives_ok($$ INSERT INTO part_number_aliases (part_spec_id, alias, alias_type) VALUES ('00000000-0000-4000-9000-000000000001', 'BQ780S', 'MARKING') $$,
  'same marking allowed on another spec');
SELECT throws_ok($$ INSERT INTO part_compatibility (part_spec_id) VALUES ('00000000-0000-4000-9000-000000000001') $$,
  '23514', NULL, 'compatibility needs a target');
SELECT throws_ok($$ INSERT INTO part_compatibility (part_spec_id, model_id, board_id) VALUES
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-f200-000000000001', '00000000-0000-4000-f400-000000000001') $$,
  '23514', NULL, 'compatibility has exactly one target');
SELECT throws_ok($$ INSERT INTO part_compatibility (part_spec_id, model_id, status) VALUES
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-f200-000000000001', 'conditional') $$,
  '23514', NULL, 'conditional needs a limitation note');
INSERT INTO part_compatibility (id, part_spec_id, model_id) VALUES
  ('00000000-0000-4000-9200-000000000001', '00000000-0000-4000-9000-000000000001', '00000000-0000-4000-f200-000000000001');
SELECT is((SELECT status || '/' || confidence FROM part_compatibility WHERE id = '00000000-0000-4000-9200-000000000001'),
  'unknown/inferred', 'defaults: unknown + inferred');
SELECT throws_ok($$ INSERT INTO part_compatibility (part_spec_id, model_id) VALUES
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-f200-000000000001') $$, '23505', NULL, 'unique per part + model');
INSERT INTO part_compatibility (part_spec_id, variant_id) VALUES ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-f300-000000000001');
SELECT throws_ok($$ INSERT INTO part_compatibility (part_spec_id, variant_id) VALUES
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-f300-000000000001') $$, '23505', NULL, 'unique per part + variant');
INSERT INTO part_compatibility (part_spec_id, board_id) VALUES ('00000000-0000-4000-9000-000000000006', '00000000-0000-4000-f400-000000000002');
SELECT throws_ok($$ INSERT INTO part_compatibility (part_spec_id, board_id) VALUES
  ('00000000-0000-4000-9000-000000000006', '00000000-0000-4000-f400-000000000002') $$, '23505', NULL, 'unique per part + board');
SELECT throws_ok($$ INSERT INTO compatibility_evidence (compatibility_id, kind, observed_status, created_by) VALUES
  ('00000000-0000-4000-9200-000000000001', 'INSTALL', 'conditional', '00000000-0000-4000-a000-000000000001') $$,
  '23514', NULL, 'conditional evidence needs a note');
SELECT throws_ok($$ INSERT INTO compatibility_evidence (compatibility_id, kind, observed_status, created_by) VALUES
  ('00000000-0000-4000-9200-000000000001', 'DOCUMENT', 'compatible', '00000000-0000-4000-a000-000000000001') $$,
  '23514', NULL, 'document evidence needs a reference');
SELECT throws_ok($$ INSERT INTO compatibility_evidence (compatibility_id, kind, observed_status, created_by) VALUES
  ('00000000-0000-4000-9200-000000000001', 'OVERRIDE', 'compatible', '00000000-0000-4000-a000-000000000001') $$,
  '23514', NULL, 'override needs a reason');
DELETE FROM part_compatibility;

-- ---------- 2. RLS ----------
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM part_specs), 7, 'TECHNICIAN reads part specs');
SELECT throws_ok($$ INSERT INTO part_specs (part_type, name, compat_target) VALUES ('FAN', 'x1', 'MODEL') $$, '42501', NULL, 'TECHNICIAN cannot insert part specs directly');
SELECT throws_ok($$ INSERT INTO part_number_aliases (part_spec_id, alias) VALUES ('00000000-0000-4000-9000-000000000001', 'zz') $$, '42501', NULL, 'TECHNICIAN cannot insert aliases');
UPDATE part_specs SET description = 'x' WHERE id = '00000000-0000-4000-9000-000000000001';
RESET ROLE;
SELECT is((SELECT description FROM part_specs WHERE id = '00000000-0000-4000-9000-000000000001'), NULL, 'TECHNICIAN update affects nothing');
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO part_number_aliases (part_spec_id, alias) VALUES ('00000000-0000-4000-9000-000000000002', 'NV156FHM N48') $$, 'ADMIN inserts alias');
SELECT lives_ok($$ UPDATE part_specs SET needs_review = false WHERE id = '00000000-0000-4000-9000-000000000001' $$, 'ADMIN updates spec');
SELECT throws_ok($$ INSERT INTO part_compatibility (part_spec_id, model_id) VALUES
  ('00000000-0000-4000-9000-000000000001', '00000000-0000-4000-f200-000000000001') $$, '42501', NULL, 'even ADMIN cannot write part_compatibility directly');
SELECT throws_ok($$ UPDATE part_compatibility SET status = 'compatible', confidence = 'verified' $$, '42501', NULL, 'status/confidence not writable directly');
SELECT throws_ok($$ DELETE FROM compatibility_evidence $$, '42501', NULL, 'evidence cannot be deleted');
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM part_number_aliases), 3, 'CS reads aliases');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT count(*) FROM part_specs $$, '42501', NULL, 'anon cannot read part_specs');
SELECT throws_ok($$ SELECT count(*) FROM compatibility_evidence $$, '42501', NULL, 'anon cannot read evidence');
SELECT throws_ok($$ SELECT count(*) FROM compatibility_summary $$, '42501', NULL, 'anon cannot read the summary view');
RESET ROLE;

-- ---------- 3. part_spec_create / part_spec_search ----------
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT part_spec_create('FAN', 'DFS5K12') $$, 'P0001', '부품 규격 등록 권한이 없습니다.', 'create: CS refused');
RESET ROLE;
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'c_tech', part_spec_create('IC', 'ISL9538', 'Renesas');
INSERT INTO res SELECT 'c_dup', part_spec_create('PANEL', 'lp156wfc-spd1');
SELECT throws_ok($$ SELECT part_spec_create('PANEL', '  ') $$, 'P0001', '품번(명칭)을 입력해 주세요.', 'create: empty name refused');
SELECT throws_ok($$ SELECT part_spec_create('SCREW', 'x') $$, 'P0001', '부품 종류를 선택해 주세요.', 'create: unknown type refused');
SELECT is((SELECT part_spec_id FROM part_spec_search('bq780') LIMIT 1), '00000000-0000-4000-9000-000000000006'::uuid, 'search by chip marking alias');
SELECT is((SELECT count(*)::int FROM part_spec_search('BQ780S')), 2, 'a marking shared by two specs returns both');
SELECT is((SELECT name FROM part_spec_search('156wfc') LIMIT 1), 'LP156WFC-SPD1', 'search by partial part number');
SELECT is((SELECT count(*)::int FROM part_spec_search('zzzzqqqq')), 0, 'search: no match');
RESET ROLE;
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'c_admin', part_spec_create('BATTERY', 'L19M3PF7');
RESET ROLE;
SELECT is((SELECT v->>'existed' FROM res WHERE k = 'c_tech'), 'false', 'create: TECHNICIAN creates a spec');
SELECT is((SELECT needs_review::text || '/' || compat_target || '/' || created_by FROM part_specs WHERE id = (SELECT (v->>'part_spec_id')::uuid FROM res WHERE k = 'c_tech')),
  'true/BOARD/00000000-0000-4000-a000-000000000004', 'create: non-admin → needs_review, IC → BOARD, created_by');
SELECT is((SELECT count(*)::int FROM part_number_aliases WHERE part_spec_id = (SELECT (v->>'part_spec_id')::uuid FROM res WHERE k = 'c_tech')), 1, 'create: alias added');
SELECT is((SELECT v FROM res WHERE k = 'c_dup'), '{"existed": true, "part_spec_id": "00000000-0000-4000-9000-000000000001"}'::jsonb, 'create: duplicate returns the existing spec');
SELECT is((SELECT needs_review::text || '/' || compat_target FROM part_specs WHERE name = 'L19M3PF7'), 'false/MODEL', 'create: ADMIN → no review flag, default MODEL');

-- ---------- 4. record_part_install_result ----------
SELECT pg_temp.jwt('5');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-9000-000000000004', 'OK', NULL, 'MODEL', '00000000-0000-4000-f200-000000000001') $$,
  'P0001', '수정 권한이 없습니다. (승인·취소된 접수건의 수리 기록은 관리자만 수정할 수 있습니다)', 'install: unassigned EXPERT_REPAIR refused');
RESET ROLE;
SELECT pg_temp.jwt('3');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-9000-000000000004', 'OK', NULL, 'MODEL', '00000000-0000-4000-f200-000000000001') $$,
  'P0001', NULL, 'install: RECEPTION refused');
RESET ROLE;
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-9000-000000000004', 'OK', NULL, 'MODEL', '00000000-0000-4000-f200-000000000001') $$,
  'P0001', NULL, 'install: CS refused');
RESET ROLE;

SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000001', '00000000-0000-4000-9000-000000000004', 'OK') $$,
  'P0001', '승인된 자재만 호환 확인을 기록할 수 있습니다.', 'install: pending material refused');
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000032', '00000000-0000-4000-9000-000000000004', 'OK') $$,
  'P0001', '외주·소프트웨어 항목은 호환 확인 대상이 아닙니다.', 'install: software refused');
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-9000-000000000004', 'MAYBE') $$,
  'P0001', '호환 확인 결과를 선택해 주세요.', 'install: unknown answer refused');
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', NULL, 'OK') $$,
  'P0001', '부품 규격을 선택해 주세요.', 'install: spec required');
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-9000-000000000004', 'OK') $$,
  'P0001', '접수건에 연결된 표준 모델 정보가 없습니다. 대상을 선택해 주세요.', 'install: no ticket link and no target → error');
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-9000-000000000004', 'OK', NULL, 'BOARD', '00000000-0000-4000-f400-000000000001') $$,
  'P0001', '이 부품 규격의 호환 기준은 모델/변형입니다.', 'install: target type must fit the spec');
SELECT is((SELECT count(*)::int FROM compatibility_evidence), 0, 'refused calls left no evidence');
SELECT is((SELECT count(*)::int FROM part_compatibility), 0, 'refused calls left no compatibility row');

INSERT INTO res SELECT 'i_ok', record_part_install_result('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-9000-000000000004', 'OK', NULL, 'MODEL', '00000000-0000-4000-f200-000000000001');
SELECT is((SELECT v->>'status' FROM res WHERE k = 'i_ok') || '/' || (SELECT v->>'confidence' FROM res WHERE k = 'i_ok'), 'compatible/verified', 'install OK → compatible + verified');
SELECT is((SELECT kind || '/' || ticket_id || '/' || created_by FROM compatibility_evidence),
  'INSTALL/00000000-0000-4000-d000-000000000005/00000000-0000-4000-a000-000000000004', 'evidence stores kind, ticket and the answering person');
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-9000-000000000004', 'CONDITIONAL', '  ', 'MODEL', '00000000-0000-4000-f200-000000000001') $$,
  'P0001', '조건부는 제한사항을 입력해 주세요.', 'install: conditional needs a note');
SELECT is((SELECT count(*)::int FROM compatibility_evidence WHERE retracted_at IS NULL), 1, 'failed change keeps the previous answer active');
INSERT INTO res SELECT 'i_cond', record_part_install_result('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-9000-000000000004', 'CONDITIONAL', '방열판 간섭', 'MODEL', '00000000-0000-4000-f200-000000000001');
SELECT is((SELECT status || '/' || confidence || '/' || limitation_note FROM part_compatibility), 'conditional/verified/방열판 간섭', 'changed answer → conditional with the note');
SELECT is((SELECT count(*)::int FROM compatibility_evidence), 2, 'history kept (2 rows)');
SELECT is((SELECT count(*)::int FROM compatibility_evidence WHERE retracted_at IS NULL), 1, 'one active answer per material');
SELECT is((SELECT retract_reason FROM compatibility_evidence WHERE retracted_at IS NOT NULL), '응답 변경', 'old answer retracted with a reason');
INSERT INTO res SELECT 'i_unk', record_part_install_result('00000000-0000-4000-e000-000000000005', NULL, 'UNKNOWN');
SELECT is((SELECT count(*)::int FROM compatibility_evidence WHERE retracted_at IS NULL), 0, 'UNKNOWN (판단불가) → no active evidence');
SELECT is((SELECT count(*)::int FROM compatibility_evidence), 2, 'UNKNOWN adds no evidence row');
SELECT is((SELECT status || '/' || confidence || '/' || coalesce(limitation_note, '-') FROM part_compatibility), 'unknown/inferred/-', 'no evidence left → unknown + inferred');

-- ticket link wins over the parameters (t4: model 02 + variant)
INSERT INTO res SELECT 'i_link', record_part_install_result('00000000-0000-4000-e000-000000000031', '00000000-0000-4000-9000-000000000004', 'OK', NULL, 'MODEL', '00000000-0000-4000-f200-000000000003');
SELECT is((SELECT variant_id FROM part_compatibility WHERE id = (SELECT (v->>'compatibility_id')::uuid FROM res WHERE k = 'i_link')),
  '00000000-0000-4000-f300-000000000001'::uuid, 'ticket catalog link (variant) is the target, parameters ignored');
-- answer for t5 again (used by the lock test)
SELECT lives_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-9000-000000000004', 'OK', NULL, 'MODEL', '00000000-0000-4000-f200-000000000001') $$, 'answer again after UNKNOWN');
RESET ROLE;

-- P4: approving the ticket creates nothing by itself
CREATE TEMP TABLE ev_before AS SELECT count(*) AS n, (SELECT count(*) FROM part_compatibility) AS c FROM compatibility_evidence;
UPDATE repair_tickets SET is_approved = true, status = 'COMPLETED', completed_at = now() WHERE id = '00000000-0000-4000-d000-000000000005';
UPDATE repair_tickets SET status = 'WAITING_APPROVAL' WHERE id = '00000000-0000-4000-d000-000000000004';
SELECT is((SELECT count(*) FROM compatibility_evidence), (SELECT n FROM ev_before), 'ticket approval / status change creates no evidence (no automatic verified)');
SELECT is((SELECT count(*) FROM part_compatibility), (SELECT c FROM ev_before), 'ticket approval creates no compatibility row');

-- lock after approval
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', NULL, 'UNKNOWN') $$, 'P0001', NULL, 'TECHNICIAN locked out after approval');
RESET ROLE;
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', NULL, 'UNKNOWN') $$, 'P0001', NULL, 'MANAGER locked out after approval');
SELECT lives_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000031', '00000000-0000-4000-9000-000000000004', 'OK') $$, 'MANAGER answers on a ticket waiting for approval');
RESET ROLE;
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000005', '00000000-0000-4000-9000-000000000004', 'INCOMPATIBLE', NULL, 'MODEL', '00000000-0000-4000-f200-000000000001') $$, 'ADMIN corrects after approval');
SELECT throws_ok($$ SELECT record_part_install_result('00000000-0000-4000-e000-000000000007', '00000000-0000-4000-9000-000000000001', 'OK', NULL, 'MODEL', '00000000-0000-4000-f200-000000000001') $$,
  'P0001', '외주·소프트웨어 항목은 호환 확인 대상이 아닙니다.', 'install: outsourced refused');
RESET ROLE;
SELECT is((SELECT status || '/' || confidence FROM part_compatibility WHERE part_spec_id = '00000000-0000-4000-9000-000000000004' AND model_id = '00000000-0000-4000-f200-000000000001'),
  'incompatible/verified', 'ADMIN correction applied');

-- ---------- 5. record_compatibility_result + recompute rules ----------
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT record_compatibility_result('00000000-0000-4000-9000-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000003', 'INFERENCE', 'compatible') $$,
  'P0001', '호환성 근거 등록은 관리자만 할 수 있습니다.', 'record: MANAGER refused');
SELECT throws_ok($$ SELECT retract_compatibility_evidence(gen_random_uuid(), 'x') $$, 'P0001', '근거 철회는 관리자만 할 수 있습니다.', 'retract: MANAGER refused');
RESET ROLE;

SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT record_compatibility_result('00000000-0000-4000-9000-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000003', 'DOCUMENT', 'compatible') $$,
  'P0001', '문서 근거는 출처(문서명 또는 URL)를 입력해 주세요.', 'record: document needs a reference');
SELECT throws_ok($$ SELECT record_compatibility_result('00000000-0000-4000-9000-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000003', 'OVERRIDE', 'compatible') $$,
  'P0001', '관리자 조정 사유를 입력해 주세요.', 'record: override needs a reason');
SELECT throws_ok($$ SELECT record_compatibility_result('00000000-0000-4000-9000-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000003', 'INFERENCE', 'conditional') $$,
  'P0001', '조건부는 제한사항을 입력해 주세요.', 'record: conditional needs a note');
SELECT throws_ok($$ SELECT record_compatibility_result('00000000-0000-4000-9000-000000000006', 'MODEL', '00000000-0000-4000-f200-000000000003', 'INFERENCE', 'compatible') $$,
  'P0001', '이 부품 규격의 호환 기준은 메인보드입니다.', 'record: IC spec only attaches to boards');
SELECT throws_ok($$ SELECT record_compatibility_result('00000000-0000-4000-9000-000000000002', 'MODEL', gen_random_uuid(), 'INFERENCE', 'compatible') $$,
  'P0001', '표준 모델을 찾을 수 없습니다.', 'record: unknown target refused');
SELECT throws_ok($$ SELECT record_compatibility_result('00000000-0000-4000-9000-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000003', 'VERIFIED', 'compatible') $$,
  'P0001', '근거 종류를 선택해 주세요.', 'record: unknown kind refused');

INSERT INTO res SELECT 'r1', record_compatibility_result('00000000-0000-4000-9000-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000003', 'INFERENCE', 'compatible', NULL, NULL, '같은 해상도·커넥터');
SELECT is((SELECT (v->>'status') || '/' || (v->>'confidence') FROM res WHERE k = 'r1'), 'compatible/inferred', 'INFERENCE only → inferred');
INSERT INTO res SELECT 'r2', record_compatibility_result('00000000-0000-4000-9000-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000003', 'DOCUMENT', 'incompatible', NULL, '서비스 매뉴얼 p.42');
SELECT is((SELECT (v->>'status') || '/' || (v->>'confidence') FROM res WHERE k = 'r2'), 'incompatible/documented', 'DOCUMENT outranks INFERENCE → documented');
INSERT INTO res SELECT 'r3', record_compatibility_result('00000000-0000-4000-9000-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000003', 'INSTALL', 'compatible');
SELECT is((SELECT (v->>'status') || '/' || (v->>'confidence') FROM res WHERE k = 'r3'), 'compatible/verified', 'INSTALL outranks a contradicting DOCUMENT → verified');
INSERT INTO res SELECT 'r4', record_compatibility_result('00000000-0000-4000-9000-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000003', 'INSTALL', 'incompatible');
SELECT is((SELECT (v->>'status') || '/' || (v->>'confidence') FROM res WHERE k = 'r4'), 'conditional/verified', 'contradicting INSTALL results → conditional');
SELECT is((SELECT limitation_note FROM part_compatibility WHERE id = (SELECT (v->>'compatibility_id')::uuid FROM res WHERE k = 'r4')),
  '상반된 결과: 정상 1건 / 조건부 0건 / 비호환 1건 — 근거 확인 필요', 'generated conflict note');
INSERT INTO res SELECT 'r5', record_compatibility_result('00000000-0000-4000-9000-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000003', 'OVERRIDE', 'incompatible', NULL, NULL, '패널 고정 브래킷이 다름');
SELECT is((SELECT (v->>'status') || '/' || (v->>'confidence') FROM res WHERE k = 'r5'), 'incompatible/verified', 'OVERRIDE changes status, not confidence');
INSERT INTO res SELECT 'r6', retract_compatibility_evidence((SELECT (v->>'evidence_id')::uuid FROM res WHERE k = 'r5'), '재확인 필요');
SELECT is((SELECT (v->>'status') || '/' || (v->>'confidence') FROM res WHERE k = 'r6'), 'conditional/verified', 'retracting the override restores the computed status');
SELECT throws_ok($$ SELECT retract_compatibility_evidence((SELECT (v->>'evidence_id')::uuid FROM res WHERE k = 'r5'), '또') $$,
  'P0001', '근거를 찾을 수 없거나 이미 철회되었습니다.', 'retract twice refused');
SELECT throws_ok($$ SELECT retract_compatibility_evidence((SELECT (v->>'evidence_id')::uuid FROM res WHERE k = 'r4'), ' ') $$,
  'P0001', '철회 사유를 입력해 주세요.', 'retract needs a reason');

-- override alone never gives verified
INSERT INTO res SELECT 'o1', record_compatibility_result('00000000-0000-4000-9000-000000000006', 'BOARD', '00000000-0000-4000-f400-000000000001', 'OVERRIDE', 'compatible', NULL, NULL, '회로도 확인');
SELECT is((SELECT (v->>'status') || '/' || (v->>'confidence') FROM res WHERE k = 'o1'), 'compatible/inferred', 'OVERRIDE alone → inferred (never verified)');
INSERT INTO res SELECT 'o2', retract_compatibility_evidence((SELECT (v->>'evidence_id')::uuid FROM res WHERE k = 'o1'), '취소');
SELECT is((SELECT (v->>'status') || '/' || (v->>'confidence') FROM res WHERE k = 'o2'), 'unknown/inferred', 'everything retracted → unknown + inferred');

-- order independence: same evidence set in two orders on two targets
INSERT INTO res SELECT 'a1', record_compatibility_result('00000000-0000-4000-9000-000000000001', 'MODEL', '00000000-0000-4000-f200-000000000001', 'DOCUMENT', 'compatible', NULL, '데이터시트');
INSERT INTO res SELECT 'a2', record_compatibility_result('00000000-0000-4000-9000-000000000001', 'MODEL', '00000000-0000-4000-f200-000000000001', 'INSTALL', 'conditional', '밝기 조절 불가');
INSERT INTO res SELECT 'b1', record_compatibility_result('00000000-0000-4000-9000-000000000001', 'MODEL', '00000000-0000-4000-f200-000000000003', 'INSTALL', 'conditional', '밝기 조절 불가');
INSERT INTO res SELECT 'b2', record_compatibility_result('00000000-0000-4000-9000-000000000001', 'MODEL', '00000000-0000-4000-f200-000000000003', 'DOCUMENT', 'compatible', NULL, '데이터시트');
RESET ROLE;
SELECT is((SELECT status || '/' || confidence || '/' || limitation_note FROM part_compatibility WHERE part_spec_id = '00000000-0000-4000-9000-000000000001' AND model_id = '00000000-0000-4000-f200-000000000001'),
          (SELECT status || '/' || confidence || '/' || limitation_note FROM part_compatibility WHERE part_spec_id = '00000000-0000-4000-9000-000000000001' AND model_id = '00000000-0000-4000-f200-000000000003'),
          'same evidence in a different order → identical result');
SELECT is((SELECT status || '/' || confidence || '/' || limitation_note FROM part_compatibility WHERE part_spec_id = '00000000-0000-4000-9000-000000000001' AND model_id = '00000000-0000-4000-f200-000000000001'),
          'conditional/verified/밝기 조절 불가', 'conditional install → note taken from the evidence');
SELECT is((SELECT count(*)::int FROM part_compatibility WHERE confidence = 'verified'
            AND NOT EXISTS (SELECT 1 FROM compatibility_evidence e WHERE e.compatibility_id = part_compatibility.id AND e.kind = 'INSTALL' AND e.retracted_at IS NULL)),
          0, 'no verified row without an active INSTALL evidence (P4)');
SELECT is((SELECT created_by FROM compatibility_evidence WHERE id = (SELECT (v->>'evidence_id')::uuid FROM res WHERE k = 'r3')),
          '00000000-0000-4000-a000-000000000001'::uuid, 'manual evidence records the admin');

-- ---------- 6. compatibility_summary ----------
SELECT pg_temp.jwt('6');
SET LOCAL ROLE authenticated;
SELECT is((SELECT install_ok || '/' || install_conditional || '/' || install_incompatible || '/' || document_count || '/' || inference_count || '/' || has_override
             FROM compatibility_summary WHERE part_spec_id = '00000000-0000-4000-9000-000000000002' AND NOT is_candidate),
          '1/0/1/1/1/false', 'summary counts active evidence only (retracted override not counted)');
SELECT is((SELECT target_label FROM compatibility_summary WHERE part_spec_id = '00000000-0000-4000-9000-000000000002' AND NOT is_candidate),
          (SELECT b.name || ' ' || m.name FROM catalog_models m JOIN catalog_brands b ON b.id = m.brand_id WHERE m.id = '00000000-0000-4000-f200-000000000003'),
          'summary shows the target label');
-- group 1: spec 1 has rows for models 01 and 03, spec 2 for model 03, spec 3 none
SELECT is((SELECT count(*)::int FROM compatibility_summary WHERE part_spec_id = '00000000-0000-4000-9000-000000000003'), 2, 'sibling without own rows gets candidates for both targets');
SELECT is((SELECT count(*)::int FROM compatibility_summary WHERE part_spec_id = '00000000-0000-4000-9000-000000000003'
            AND (NOT is_candidate OR confidence <> 'inferred' OR status NOT IN ('compatible', 'unknown'))), 0,
          'candidates are only compatible/unknown + inferred');
SELECT is((SELECT status FROM compatibility_summary WHERE part_spec_id = '00000000-0000-4000-9000-000000000003' AND target_id = '00000000-0000-4000-f200-000000000003'),
          'unknown', 'sibling rows that are not plainly compatible → candidate unknown');
SELECT is((SELECT count(*)::int FROM compatibility_summary WHERE part_spec_id = '00000000-0000-4000-9000-000000000002' AND target_id = '00000000-0000-4000-f200-000000000003'), 1,
          'a spec with its own row is not duplicated as a candidate');
SELECT is((SELECT status || '/' || is_candidate FROM compatibility_summary WHERE part_spec_id = '00000000-0000-4000-9000-000000000002' AND target_id = '00000000-0000-4000-f200-000000000001'),
          'unknown/true', 'spec 2 gets a candidate for model 01 from spec 1 (conditional → unknown)');
RESET ROLE;
-- a plainly compatible documented sibling → candidate compatible
SELECT pg_temp.jwt('1');
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'g2', record_compatibility_result('00000000-0000-4000-9000-000000000005', 'MODEL', '00000000-0000-4000-f200-000000000002', 'DOCUMENT', 'compatible', NULL, '제조사 호환 목록');
SELECT is((SELECT status || '/' || confidence || '/' || is_candidate FROM compatibility_summary
            WHERE part_spec_id = '00000000-0000-4000-9000-000000000004' AND target_type = 'MODEL' AND target_id = '00000000-0000-4000-f200-000000000002'),
          'compatible/inferred/true', 'documented compatible sibling → candidate compatible + inferred');
SELECT is((SELECT count(*)::int FROM compatibility_summary WHERE part_spec_id = '00000000-0000-4000-9000-000000000005' AND is_candidate
            AND target_id = '00000000-0000-4000-f200-000000000001'), 1, 'verified sibling row also yields a candidate');
RESET ROLE;

-- ---------- 7. new columns ----------
SELECT pg_temp.jwt('2');
SET LOCAL ROLE authenticated;
UPDATE inventory_items SET part_spec_id = '00000000-0000-4000-9000-000000000004' WHERE id = '00000000-0000-4000-b400-000000000003';
RESET ROLE;
SELECT is((SELECT part_spec_id FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000003'), '00000000-0000-4000-9000-000000000004'::uuid, 'MANAGER links a stock item to a part spec');
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
UPDATE inventory_items SET part_spec_id = NULL WHERE id = '00000000-0000-4000-b400-000000000003';
RESET ROLE;
SELECT isnt((SELECT part_spec_id FROM inventory_items WHERE id = '00000000-0000-4000-b400-000000000003'), NULL, 'TECHNICIAN cannot change the item link (existing policy)');

UPDATE repair_tickets SET status = 'IN_PROGRESS' WHERE id = '00000000-0000-4000-d000-000000000004';
SELECT pg_temp.jwt('4');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ INSERT INTO ticket_removed_parts (ticket_id, description, part_spec_id) VALUES
  ('00000000-0000-4000-d000-000000000004', '기존 SSD', '00000000-0000-4000-9000-000000000005') $$, 'TECHNICIAN stores a part spec on a removed part');
SELECT lives_ok($$ UPDATE ticket_removed_parts SET part_spec_id = '00000000-0000-4000-9000-000000000004' WHERE description = '기존 SSD' $$, 'TECHNICIAN updates the removed part spec');
RESET ROLE;
SELECT is((SELECT part_spec_id FROM ticket_removed_parts WHERE description = '기존 SSD'), '00000000-0000-4000-9000-000000000004'::uuid, 'removed part spec saved');
SELECT throws_ok($$ DELETE FROM part_specs WHERE id = '00000000-0000-4000-9000-000000000004' $$, '23503', NULL, 'referenced part spec cannot be deleted');
SELECT throws_ok($$ DELETE FROM repair_tickets WHERE id = '00000000-0000-4000-d000-000000000005' $$, '23503', NULL, 'ticket with evidence cannot be deleted (RESTRICT)');
SELECT lives_ok($$ DELETE FROM ticket_materials WHERE id = '00000000-0000-4000-e000-000000000031' $$, 'material delete is not blocked by evidence (SET NULL)');
SELECT is((SELECT count(*)::int FROM compatibility_evidence WHERE ticket_id = '00000000-0000-4000-d000-000000000004' AND ticket_material_id IS NULL AND retracted_at IS NULL), 1,
  'evidence survives the material delete');

-- ---------- 8. privileges / definitions ----------
SELECT ok(NOT has_function_privilege('anon', 'public.record_compatibility_result(uuid, text, uuid, text, text, text, text, text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.record_part_install_result(uuid, uuid, text, text, text, uuid)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.retract_compatibility_evidence(uuid, text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.part_spec_create(text, text, text, text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.part_spec_search(text, integer)', 'EXECUTE'), 'anon cannot execute Phase 3 functions');
SELECT ok(has_function_privilege('authenticated', 'public.record_part_install_result(uuid, uuid, text, text, text, uuid)', 'EXECUTE')
      AND has_function_privilege('authenticated', 'public.part_spec_search(text, integer)', 'EXECUTE'), 'authenticated can execute the public RPCs');
SELECT ok(NOT has_function_privilege('authenticated', 'public.ri_recompute_compatibility(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('service_role', 'public.ri_recompute_compatibility(uuid)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.ri_compatibility_row(uuid, text, uuid)', 'EXECUTE')
      AND NOT has_function_privilege('service_role', 'public.ri_compatibility_row(uuid, text, uuid)', 'EXECUTE'), 'internal functions are not executable by API roles');
SELECT is((SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proconfig IS NULL
              AND p.proname IN ('part_set_updated_at', 'ri_recompute_compatibility', 'ri_compatibility_row', 'record_compatibility_result',
                                'record_part_install_result', 'retract_compatibility_evidence', 'part_spec_create', 'part_spec_search')), 0,
          'every Phase 3 function sets search_path');
SELECT is((SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relrowsecurity
              AND c.relname IN ('interchange_groups', 'part_specs', 'part_number_aliases', 'part_compatibility', 'compatibility_evidence')), 5,
          'RLS enabled on all 5 new tables');

SELECT * FROM finish();
ROLLBACK;
