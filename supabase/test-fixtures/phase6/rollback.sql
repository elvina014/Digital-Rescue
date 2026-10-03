-- Phase 6 rollback (purchase guard). App first: git revert <phase-6 commit>. Then run this.
-- Effect: purchase reason logs are lost; ticket_materials rows/statuses stay as they are.
BEGIN;
DROP TRIGGER IF EXISTS trg_ticket_materials_purchase_guard ON public.ticket_materials;
DROP FUNCTION IF EXISTS public.ri_purchase_guard_enforce();
DROP FUNCTION IF EXISTS public.request_purchase_material(uuid, text, text);
DROP FUNCTION IF EXISTS public.purchase_guard_check(uuid);
DROP FUNCTION IF EXISTS public.ri_purchase_material_info(uuid, boolean);
DROP FUNCTION IF EXISTS public.ri_purchase_resources(uuid);
DROP TABLE IF EXISTS public.purchase_guard_logs;
ALTER TABLE public.global_settings DROP COLUMN IF EXISTS ri_purchase_guard_enabled;
COMMIT;
