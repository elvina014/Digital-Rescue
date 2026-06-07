-- =============================================
-- 029_employee_assignable.sql
-- 담당자 배정 목록 포함 여부 플래그 추가
--   - is_assignable: TECHNICIAN/EXPERT_REPAIR 직원을 신규 접수 담당자 배정
--     드롭다운에 포함할지 여부. false면 목록에서 제외(이력은 보존).
-- =============================================

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_assignable BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN employees.is_assignable IS '담당자 배정 목록 포함 여부 (TECHNICIAN/EXPERT_REPAIR 대상). true=배정 가능, false=배정 목록에서 제외(이력 보존)';
