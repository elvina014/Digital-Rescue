-- Phase 5 rollback (device knowledge). Run AFTER reverting the app commit.
-- Effect: model notes are lost; nothing else changes (Phase 5 writes no other data).
BEGIN;
DROP FUNCTION IF EXISTS public.get_device_knowledge(uuid, uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.search_devices_for_part(uuid);
DROP FUNCTION IF EXISTS public.search_parts_for_device(uuid, uuid, uuid);
DROP TABLE IF EXISTS public.model_notes;
DROP FUNCTION IF EXISTS public.model_note_stamp();
COMMIT;
