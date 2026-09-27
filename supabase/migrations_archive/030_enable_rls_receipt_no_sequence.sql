-- =============================================
-- 030_enable_rls_receipt_no_sequence.sql
-- receipt_no_sequence 테이블 RLS 활성화 (보안 경고 해소)
--
--   이 테이블은 접수번호 일별 순번 카운터로, 앱 코드에서 직접 접근하지 않고
--   오직 generate_receipt_no() BEFORE INSERT 트리거(접수건 INSERT는 service_role로 실행)만 사용한다.
--   service_role은 RLS를 우회하므로 RLS 활성화 후에도 접수번호 발번/접수 생성은 영향이 없으며,
--   anon/authenticated의 직접 접근(읽기/변조)만 차단된다. (정책 없음 = 비우회 역할 전면 차단)
--
--   되돌리기(rollback):
--     ALTER TABLE public.receipt_no_sequence DISABLE ROW LEVEL SECURITY;
-- =============================================

ALTER TABLE public.receipt_no_sequence ENABLE ROW LEVEL SECURITY;
