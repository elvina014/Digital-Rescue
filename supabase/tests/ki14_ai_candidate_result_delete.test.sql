-- =============================================================
-- KI-14 — deleting a part alias that came from an approved AI candidate (Phase 9 decision D5)
-- Before the fix: the FK ON DELETE SET NULL on ai_candidates.result_alias_id fires ai_candidates_protect
--                 → "이미 처리된 후보입니다." and the alias cannot be deleted (부품 규격 → 별칭 삭제).
-- After the fix:  only that SET NULL is allowed on a processed candidate; everything else stays immutable.
-- Run: npx supabase test db   (local only; rolled back)
-- Seed users: a…01 ADMIN
-- =============================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(9);

CREATE TEMP TABLE res (k text PRIMARY KEY, v jsonb);
GRANT ALL ON res TO authenticated;

-- fixture (as owner): part spec + PENDING alias candidate, approved by the seed ADMIN through the review RPC
INSERT INTO part_specs (id, part_type, name, compat_target)
VALUES ('00000000-0000-4000-9e14-000000000001', 'IC', 'KI14-TEST-IC', 'BOARD');
INSERT INTO ai_candidates (id, candidate_type, part_spec_id, alias, alias_type, rationale, source_ref)
VALUES ('00000000-0000-4000-9e14-000000000010', 'PART_ALIAS', '00000000-0000-4000-9e14-000000000001',
        'KI14MARK', 'MARKING', 'KI-14 fixture', 'exec-ki14');

SELECT set_config('request.jwt.claims',
  '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO res SELECT 'approve', ai_candidate_approve('00000000-0000-4000-9e14-000000000010');
RESET ROLE;

SELECT ok((SELECT v ? 'alias_id' FROM res WHERE k = 'approve'), 'fixture: candidate approved, alias created');
INSERT INTO res SELECT 'before', to_jsonb(c) FROM ai_candidates c WHERE id = '00000000-0000-4000-9e14-000000000010';

-- 1. the reproduction: ADMIN deletes that alias (same statement as deletePartAliasAction)
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ DELETE FROM part_number_aliases WHERE id = (SELECT (v->>'alias_id')::uuid FROM res WHERE k = 'approve') $$,
  'KI-14: ADMIN can delete a part alias created by an approved AI candidate');
RESET ROLE;

SELECT is((SELECT count(*)::int FROM part_number_aliases WHERE alias_norm = 'ki14mark'), 0, 'the alias is gone');
SELECT is((SELECT result_alias_id FROM ai_candidates WHERE id = '00000000-0000-4000-9e14-000000000010'), NULL,
          'result_alias_id was set to NULL by the FK');
SELECT is((SELECT to_jsonb(c) - 'result_alias_id' FROM ai_candidates c WHERE id = '00000000-0000-4000-9e14-000000000010'),
          (SELECT v - 'result_alias_id' FROM res WHERE k = 'before'),
          'every other column of the candidate is unchanged (status, reviewer, time, content)');

-- 2. the processed candidate stays immutable apart from that SET NULL
INSERT INTO part_number_aliases (id, part_spec_id, alias, alias_type)
VALUES ('00000000-0000-4000-9e14-000000000020', '00000000-0000-4000-9e14-000000000001', 'KI14OTHER', 'MARKING');
SELECT throws_ok($$ UPDATE ai_candidates SET alias = 'CHANGED' WHERE id = '00000000-0000-4000-9e14-000000000010' $$,
                 'P0001', '이미 처리된 후보입니다.', 'content of a processed candidate still cannot change');
SELECT throws_ok($$ UPDATE ai_candidates SET result_alias_id = '00000000-0000-4000-9e14-000000000020'
                     WHERE id = '00000000-0000-4000-9e14-000000000010' $$,
                 'P0001', '이미 처리된 후보입니다.', 'result_alias_id cannot be set to another alias');
SELECT throws_ok($$ UPDATE ai_candidates SET status = 'REJECTED', review_note = 'x'
                     WHERE id = '00000000-0000-4000-9e14-000000000010' $$,
                 'P0001', '이미 처리된 후보입니다.', 'status of a processed candidate cannot change');

-- 3. a processed candidate that still has its alias: SET NULL together with another change is refused
INSERT INTO ai_candidates (id, candidate_type, part_spec_id, alias, alias_type, status, result_alias_id, reviewed_at)
VALUES ('00000000-0000-4000-9e14-000000000011', 'PART_ALIAS', '00000000-0000-4000-9e14-000000000001',
        'KI14OTHER', 'MARKING', 'APPROVED', '00000000-0000-4000-9e14-000000000020', now());
SELECT throws_ok($$ UPDATE ai_candidates SET result_alias_id = NULL, review_note = 'x'
                     WHERE id = '00000000-0000-4000-9e14-000000000011' $$,
                 'P0001', '이미 처리된 후보입니다.', 'SET NULL combined with another change is refused');

SELECT * FROM finish();
ROLLBACK;
