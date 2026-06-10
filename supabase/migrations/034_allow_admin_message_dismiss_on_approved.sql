-- 034: 승인 완료 건의 관리자 메시지 '확인 완료' 허용
--
-- 문제: 관리자가 메모로 메시지를 남기면 has_admin_message=true 로 설정되고,
--      담당자(TECHNICIAN/EXPERT_REPAIR)에게 확인 배너가 표시된다.
--      그러나 해당 건이 승인 완료(is_approved=true)되면 protect_approved_ticket
--      트리거가 ADMIN/MANAGER 외 모든 직급의 UPDATE를 차단하여,
--      담당자가 '메시지 확인 완료'(has_admin_message → false)를 누르면 실패한다.
--      (service_role 클라이언트로 우회 시도해도 auth.uid()=NULL → 트리거가 동일하게 차단)
--
-- 해결: has_admin_message(단순 알림 플래그)만 변경되는 UPDATE는 직급과 무관하게 허용한다.
--      금액/상태 등 보호 대상 컬럼이 함께 바뀌면 기존대로 차단된다.

CREATE OR REPLACE FUNCTION protect_approved_ticket()
RETURNS TRIGGER AS $$
DECLARE
  current_role employee_role;
  new_other repair_tickets;
BEGIN
  -- 승인 완료 상태가 아니면 통과
  IF OLD.is_approved = FALSE THEN
    RETURN NEW;
  END IF;

  -- 관리자 메시지 알림 플래그(has_admin_message)만 변경되는 경우는 직급 무관 허용.
  -- NEW에서 has_admin_message와 updated_at만 OLD 값으로 되돌린 뒤 OLD와 비교하여,
  -- 그 외 컬럼이 하나도 바뀌지 않았으면 플래그 전용 변경으로 간주한다.
  new_other := NEW;
  new_other.has_admin_message := OLD.has_admin_message;
  new_other.updated_at := OLD.updated_at;
  IF new_other IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  -- 현재 사용자의 직급 조회
  SELECT role INTO current_role
  FROM employees
  WHERE id = auth.uid();

  -- ADMIN은 모든 수정 허용
  IF current_role = 'ADMIN' THEN
    RETURN NEW;
  END IF;

  -- MANAGER는 is_approved 변경 외의 금액 변경은 차단
  IF current_role = 'MANAGER' THEN
    IF NEW.final_price <> OLD.final_price THEN
      RAISE EXCEPTION '승인 완료된 접수건의 금액은 수정할 수 없습니다.';
    END IF;
    RETURN NEW;
  END IF;

  -- 그 외 직급은 승인 완료 후 일체 수정 불가
  RAISE EXCEPTION '승인 완료된 접수건은 수정할 수 없습니다. (권한: %)' , current_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
