-- =============================================================
-- Phase 8 — LOCAL demo knowledge for the real-login test (B) and the E2E UI test (C). FAKE DATA ONLY.
--   docker exec -i supabase_db_digital-rescue psql -U postgres -d postgres -X < supabase/test-fixtures/phase8/demo.sql
-- Removed by the next `npx supabase db reset`. Never run against production.
-- =============================================================
BEGIN;
INSERT INTO part_specs (id, part_type, name, compat_target) VALUES
  ('00000000-0000-4000-9100-000000000001', 'PANEL',   'LP156WF9-SPK2', 'MODEL'),
  ('00000000-0000-4000-9100-000000000002', 'BATTERY', 'L19M3PF7',      'MODEL'),
  ('00000000-0000-4000-9100-000000000003', 'IC',      'BQ24780SRUYR',  'BOARD');
INSERT INTO part_number_aliases (part_spec_id, alias, alias_type) VALUES
  ('00000000-0000-4000-9100-000000000003', 'BQ24780S', 'MARKING');
UPDATE inventory_items SET part_spec_id = '00000000-0000-4000-9100-000000000002' WHERE id = '00000000-0000-4000-b400-000000000003';

INSERT INTO repair_tickets (id, customer_id, status, receipt_type, device_type, device_brand, device_model, symptoms,
                            initial_estimate, final_price, is_approved, payment_status, received_at, completed_at, catalog_model_id)
VALUES ('00000000-0000-4000-9200-000000000001', '00000000-0000-4000-c000-000000000001', 'COMPLETED', 'WALK_IN', '노트북', 'LG',
        '15Z90T', '화면 안 나옴', 0, 150000, true, 'PAID', now() - interval '3 days', now() - interval '2 days',
        '00000000-0000-4000-f200-000000000001');
INSERT INTO repair_records (ticket_id, diagnosis_summary, fault_category, result, notes) VALUES
  ('00000000-0000-4000-9200-000000000001', '테스트고객1 요청 — 패널 불량, 연락처 010-5555-6666', 'DISPLAY', 'COMPLETED', '내부 메모');
INSERT INTO repair_actions (ticket_id, action_type, description, succeeded) VALUES
  ('00000000-0000-4000-9200-000000000001', 'REPLACE', '패널 교체', true);

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-a000-000000000001", "role": "authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT record_compatibility_result('00000000-0000-4000-9100-000000000001', 'MODEL', '00000000-0000-4000-f200-000000000001', 'INSTALL', 'compatible');
SELECT record_compatibility_result('00000000-0000-4000-9100-000000000002', 'MODEL', '00000000-0000-4000-f200-000000000003', 'INSTALL', 'incompatible');
RESET ROLE;
COMMIT;
