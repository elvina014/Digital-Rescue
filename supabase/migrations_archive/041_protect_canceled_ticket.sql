-- =============================================================
-- 041_protect_canceled_ticket.sql
-- 취소 복원 권한을 DB 레벨에서 강제 (ADMIN · MANAGER 전용)
-- =============================================================
-- 배경: tickets_update RLS 정책은 TECHNICIAN/EXPERT_REPAIR에게
--      "본인 배정 건"의 UPDATE를 허용한다. 따라서 담당기사가 본인에게
--      배정된 취소건의 status를 직접 되돌리는 경로가 열려 있다.
--      서버 액션(restoreCanceledTicketAction)의 직급 검사만으로는
--      PostgREST 직접 호출을 막지 못하므로 트리거로 차단한다.
--
-- 검사 범위: CANCELED에서 벗어나는 status 변경만.
--   - 취소 처리(→ CANCELED)          : OLD.status <> 'CANCELED' 이므로 통과
--   - 취소건의 다른 컬럼 변경          : NEW.status = 'CANCELED' 이므로 통과
--     (폐기 확인 dispose_confirmed_at, 취소 시 images 비우기 등)
--   - 취소건의 status 변경             : ADMIN · MANAGER만 허용
--
-- service_role(admin 클라이언트)은 auth.uid()가 NULL이라 함께 차단된다.
-- 현재 취소 해제를 admin 클라이언트로 수행하는 코드 경로는 없다.
-- =============================================================

CREATE OR REPLACE FUNCTION protect_canceled_ticket()
RETURNS TRIGGER AS $$
DECLARE
  v_role employee_role;
BEGIN
  -- 취소 상태에서 벗어나는 변경이 아니면 통과
  IF OLD.status <> 'CANCELED' OR NEW.status = 'CANCELED' THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_role FROM employees WHERE id = auth.uid();

  IF v_role IN ('ADMIN', 'MANAGER') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '취소된 접수건은 관리자 또는 팀장만 복원할 수 있습니다. (권한: %)',
    COALESCE(v_role::text, '없음');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_canceled_ticket ON repair_tickets;
CREATE TRIGGER trg_protect_canceled_ticket
  BEFORE UPDATE ON repair_tickets
  FOR EACH ROW
  EXECUTE FUNCTION protect_canceled_ticket();

-- 트리거 전용 함수 — 실행 권한 회수 (031 · 039와 동일)
REVOKE ALL ON FUNCTION protect_canceled_ticket() FROM PUBLIC, anon, authenticated;
