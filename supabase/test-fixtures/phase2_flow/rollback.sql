-- Phase 2 rollback (verified locally 2026-10-01). Revert the app first (git revert), then run this.
-- All repair-record data is lost; stock already booked through the RPCs stays (ordinary rows in existing tables).
BEGIN;
-- M2 (20261001134100_inventory_flow_rpcs.sql)
DROP FUNCTION IF EXISTS public.approve_removed_part_inbound(uuid);
DROP FUNCTION IF EXISTS public.confirm_material_return(uuid);
DROP FUNCTION IF EXISTS public.approve_return_material(uuid);
DROP FUNCTION IF EXISTS public.register_return_material(uuid, uuid, text, text, text, integer, text);
DROP FUNCTION IF EXISTS public.ri_inbound_extracted_part(uuid, text, text, text, integer, uuid, uuid);
-- M1 (20261001134000_repair_records.sql)
DROP FUNCTION IF EXISTS public.repair_gate_override(uuid, text, text);
DROP FUNCTION IF EXISTS public.repair_set_cancel_result(uuid, text);
DROP FUNCTION IF EXISTS public.repair_gate_check(uuid, text);
DROP VIEW IF EXISTS public.repair_parts_used;
DROP TABLE IF EXISTS public.ticket_close_overrides, public.ticket_removed_parts, public.repair_actions,
  public.repair_faults, public.repair_measurements, public.repair_records, public.ticket_symptoms,
  public.symptom_codes;
DROP FUNCTION IF EXISTS public.repair_record_can_edit(uuid);
DROP FUNCTION IF EXISTS public.repair_removed_part_stamp();
DROP FUNCTION IF EXISTS public.repair_set_updated_at();
ALTER TABLE public.global_settings
  DROP COLUMN IF EXISTS ri_approval_gate_enabled,
  DROP COLUMN IF EXISTS ri_cancel_gate_enabled;
COMMIT;
