-- =============================================
-- 031_revoke_approve_material_dispatch_public.sql
-- approve_material_dispatch RPC의 외부 실행 권한 회수 (보안 경고 해소)
--
--   approve_material_dispatch는 SECURITY DEFINER 함수로 재고 차감 + 자재 출고 승인을
--   수행하며 내부에 호출자 권한 검사가 없다. 앱은 이 함수를 service_role(admin client)로만
--   호출하므로(actions.ts), anon/authenticated/PUBLIC의 실행 권한은 불필요하다.
--
--   PostgreSQL 기본값(GRANT EXECUTE ... TO PUBLIC) 때문에 anon/authenticated만 회수해도
--   PUBLIC을 통해 누구나 실행 가능하므로 PUBLIC까지 함께 회수한다.
--   service_role/postgres의 실행 권한은 유지되어 앱 동작에는 영향이 없다.
--
--   되돌리기(rollback):
--     GRANT EXECUTE ON FUNCTION public.approve_material_dispatch(uuid, uuid)
--       TO PUBLIC, anon, authenticated;
-- =============================================

REVOKE EXECUTE ON FUNCTION public.approve_material_dispatch(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
