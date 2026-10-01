-- Phase 2 equivalence fixtures (local only, fake data). Run on a freshly reset local DB:
--   docker exec -i supabase_db_digital-rescue psql -U postgres -v ON_ERROR_STOP=1 < setup.sql
-- t5 = d…05 (WAITING_APPROVAL, assignee tech a…04), t7 = d…07 (CANCELED), t4 = d…04 (IN_PROGRESS)
INSERT INTO public.ticket_materials
  (id, ticket_id, inventory_item_id, quantity, request_status, request_type, created_by,
   is_return_registered, return_category_id, return_spec, return_name, return_condition, return_status, return_quantity, return_capacity)
VALUES
  -- (b) purchase waiting for return confirmation
  ('00000000-0000-4000-e000-000000000021', '00000000-0000-4000-d000-000000000007', '00000000-0000-4000-b400-000000000002', 1, 'cancel_requested', 'purchase', '00000000-0000-4000-a000-000000000004', false, NULL, NULL, NULL, NULL, NULL, 1, NULL),
  -- (c) existing USED item with the same capacity, qty 2
  ('00000000-0000-4000-e000-000000000022', '00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b400-000000000001', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004',
   true, '00000000-0000-4000-b100-000000000001', '노트북용 DDR4', '삼성 DDR4-3200', '중고품', 'pending', 2, '8GB'),
  -- (d)(f) new spec + new product, 불량품, no capacity
  ('00000000-0000-4000-e000-000000000023', '00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b400-000000000001', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004',
   true, '00000000-0000-4000-b100-000000000001', '신규스펙', '신규제품', '불량품', 'pending', 1, NULL),
  -- (g) return category differs from the original item; existing product whose only USED item has a capacity (D1)
  ('00000000-0000-4000-e000-000000000024', '00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b400-000000000003', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004',
   true, '00000000-0000-4000-b100-000000000001', '노트북용 DDR4', '하이닉스 DDR4', '중고품', 'pending', 1, NULL),
  -- legacy row without return_category_id: falls back to the category of the original item
  ('00000000-0000-4000-e000-000000000025', '00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b400-000000000004', 1, 'approved', 'dispatch', '00000000-0000-4000-a000-000000000004',
   true, NULL, 'M.2 NVMe', 'WD', '중고품', 'pending', 1, '256GB');
-- (h) an approved material on an IN_PROGRESS ticket so the technician can register an extracted part in the UI
UPDATE public.ticket_materials SET request_status = 'approved' WHERE id = '00000000-0000-4000-e000-000000000002';
