-- Phase 4 rollback (donor devices). Run AFTER reverting the app (git revert <phase-4 commit>).
-- Effect: donor records, candidates and photo rows are lost. Stock already booked by extraction stays
-- (ordinary inventory_items / inventory_transactions rows). Converted tickets keep dispose_confirmed_at and their log line.
BEGIN;
DROP FUNCTION IF EXISTS public.donor_extract_part(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.donor_convert_from_ticket(uuid, boolean, text, text, text, text, text);
DROP VIEW IF EXISTS public.donor_potential_stock;
DROP POLICY IF EXISTS donor_photos_storage_select ON storage.objects;
DROP POLICY IF EXISTS donor_photos_storage_insert ON storage.objects;
DROP POLICY IF EXISTS donor_photos_storage_delete ON storage.objects;
DROP TABLE IF EXISTS public.donor_photos, public.donor_part_candidates, public.donor_devices;
DROP SEQUENCE IF EXISTS public.donor_no_seq;
COMMIT;
-- Bucket `donor-photos`: empty and delete it through the Storage API or the dashboard
-- (Supabase blocks direct DELETE on storage tables). An empty private bucket left behind is harmless.
