-- =============================================================
-- 039_refund_function_hardening.sql
-- 환불 함수 권한 정리 (환불 정책 Phase 1-4)
-- =============================================================
-- Supabase advisor 지적 사항 해소:
--
--  1) anon 실행 권한 잔존
--     038에서 REVOKE ... FROM PUBLIC 후 authenticated에만 GRANT 했으나,
--     Supabase의 기본 권한(ALTER DEFAULT PRIVILEGES)이 anon에게도 EXECUTE를
--     명시적으로 부여해 두기 때문에 PUBLIC 회수만으로는 남는다.
--     (실제로는 함수 첫 줄의 auth.uid() 검사에서 막히지만 표면적을 없앤다)
--
--  2) 트리거 전용 함수가 RPC 엔드포인트로 노출
--     generate_refund_no / sync_ticket_refunded_amount는 트리거로만 쓰인다.
--     트리거 실행은 EXECUTE 권한을 검사하지 않으므로 전부 회수해도 동작한다.
--
--  3) protect_approved_ticket의 search_path 고정
--     037에서 함수를 재정의했으므로 SECURITY DEFINER 권장 설정을 함께 적용한다.
--     참조 객체는 모두 public이거나 스키마 한정(auth.uid())이라 동작은 동일하다.
-- =============================================================

-- 1) 환불 RPC — anon 실행 권한 제거 (authenticated만 유지)
REVOKE ALL ON FUNCTION request_refund(UUID, INTEGER, refund_reason, refund_method, parts_recovery, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION transition_refund(UUID, TEXT, TEXT, BOOLEAN) FROM anon;

-- 2) 트리거 전용 함수 — 실행 권한 전면 회수
REVOKE ALL ON FUNCTION generate_refund_no()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sync_ticket_refunded_amount()   FROM PUBLIC, anon, authenticated;

-- 3) protect_approved_ticket — search_path 고정 (본문은 037과 동일)
ALTER FUNCTION protect_approved_ticket() SET search_path = public;
