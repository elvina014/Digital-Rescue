-- =============================================
-- 032_generate_receipt_no_security_definer.sql
-- generate_receipt_no() 트리거를 SECURITY DEFINER로 변경 (접수 등록 RLS 오류 해결)
--
--   배경: 030에서 receipt_no_sequence에 RLS를 켠 뒤, 관리자/접수처 신규접수 경로
--   (createTicketAction → 사용자 세션 = authenticated 역할)에서 트리거가 순번을 기록할 때
--   RLS에 막혀 "new row violates row-level security policy" 오류가 발생했다.
--
--   해결: 트리거 함수를 SECURITY DEFINER로 변경하여 소유자(postgres, BYPASSRLS) 권한으로
--   실행 → authenticated/service_role 어느 경로든 순번 기록 성공. receipt_no_sequence의 RLS는
--   그대로 유지되어 외부 직접 접근 차단(030의 보안 개선)을 보존한다.
--   SECURITY DEFINER 하드닝을 위해 search_path도 고정한다.
--
--   번호 생성 로직은 027 원본과 동일(변경 없음).
--
--   되돌리기(rollback): 027 원본 정의(SECURITY INVOKER, search_path 미설정)로 복원
--     CREATE OR REPLACE FUNCTION public.generate_receipt_no()
--     RETURNS TRIGGER LANGUAGE plpgsql AS $$ ... 027 본문 ... $$;
--   (또는 긴급 시: ALTER TABLE public.receipt_no_sequence DISABLE ROW LEVEL SECURITY;)
-- =============================================

CREATE OR REPLACE FUNCTION public.generate_receipt_no()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_date DATE;
  v_seq  INTEGER;
BEGIN
  -- 이미 receipt_no가 지정되어 있으면 건너뜀 (백필 INSERT용)
  IF NEW.receipt_no IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 한국시간 기준 일자 산출
  v_date := (NEW.created_at AT TIME ZONE 'Asia/Seoul')::DATE;

  -- 동시성 안전: 동일 date_key 행이 없으면 1로 INSERT, 있으면 +1
  INSERT INTO receipt_no_sequence(date_key, current_seq)
  VALUES (v_date, 1)
  ON CONFLICT (date_key) DO UPDATE
    SET current_seq = receipt_no_sequence.current_seq + 1
  RETURNING current_seq INTO v_seq;

  NEW.receipt_no := to_char(v_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  RETURN NEW;
END;
$function$;
