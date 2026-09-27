-- =============================================================
-- Baseline migration (Repair Intelligence Phase 0.1)
-- Created 20260927141005 UTC from a schema-only dump of production (wnddkgeohcgcidoklrps),
-- taken 2026-09-27 by Brad with `supabase db dump`.
--
-- This single file represents the full production schema at that time.
-- Earlier migrations (001–042) are kept for history in supabase/migrations_archive/
-- and are never executed.
--
-- Sections:
--   1. public schema etc. — dump output, unmodified (line endings normalised to LF)
--   2. storage buckets + storage.objects policies — reconstructed from the
--      production catalog (not in the dump). Reproduces production as-is,
--      including known issues documented in docs/repair-intelligence/known-issues.md KI-7.
-- =============================================================




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."device_type" AS ENUM (
    '노트북',
    '데스크탑',
    '서버',
    '나스',
    '기타저장장치',
    '태블릿'
);


ALTER TYPE "public"."device_type" OWNER TO "postgres";


CREATE TYPE "public"."employee_role" AS ENUM (
    'ADMIN',
    'MANAGER',
    'RECEPTION',
    'TECHNICIAN',
    'EXPERT_REPAIR',
    'CS'
);


ALTER TYPE "public"."employee_role" OWNER TO "postgres";


CREATE TYPE "public"."inventory_condition" AS ENUM (
    'NEW',
    'GOOD',
    'DEFECTIVE',
    'SURPLUS'
);


ALTER TYPE "public"."inventory_condition" OWNER TO "postgres";


CREATE TYPE "public"."inventory_transaction_type" AS ENUM (
    'INBOUND',
    'OUTBOUND',
    'ADJUSTMENT'
);


ALTER TYPE "public"."inventory_transaction_type" OWNER TO "postgres";


CREATE TYPE "public"."item_condition" AS ENUM (
    'NEW',
    'USED'
);


ALTER TYPE "public"."item_condition" OWNER TO "postgres";


CREATE TYPE "public"."material_request_status" AS ENUM (
    'pending',
    'requested',
    'approved',
    'rejected',
    'cancelled',
    'cancel_requested'
);


ALTER TYPE "public"."material_request_status" OWNER TO "postgres";


CREATE TYPE "public"."parts_recovery" AS ENUM (
    'RECOVERED',
    'NOT_RECOVERED',
    'NONE'
);


ALTER TYPE "public"."parts_recovery" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'PENDING',
    'PAID',
    'PARTIALLY_REFUNDED',
    'REFUNDED'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."receipt_type" AS ENUM (
    'VISIT',
    'DELIVERY',
    'WALK_IN',
    'QUICK',
    'PARCEL',
    '미정'
);


ALTER TYPE "public"."receipt_type" OWNER TO "postgres";


CREATE TYPE "public"."refund_method" AS ENUM (
    'CARD_CANCEL',
    'CARD_PARTIAL_CANCEL',
    'BANK_REFUND',
    'CASH'
);


ALTER TYPE "public"."refund_method" OWNER TO "postgres";


CREATE TYPE "public"."refund_reason" AS ENUM (
    'QUALITY',
    'REPAIR_FAILED',
    'OVERCHARGE',
    'DUPLICATE',
    'COMPLAINT',
    'CHANGE_MIND',
    'OTHER'
);


ALTER TYPE "public"."refund_reason" OWNER TO "postgres";


CREATE TYPE "public"."refund_status" AS ENUM (
    'REQUESTED',
    'APPROVED',
    'COMPLETED',
    'REJECTED',
    'VOID'
);


ALTER TYPE "public"."refund_status" OWNER TO "postgres";


CREATE TYPE "public"."ticket_status" AS ENUM (
    'NEW',
    'ASSIGNED',
    'RECEIVED',
    'IN_PROGRESS',
    'WAITING_APPROVAL',
    'COMPLETED',
    'CANCELED'
);


ALTER TYPE "public"."ticket_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_refund_material_adjustments"("p_refund_id" "uuid", "p_revert" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_r            ticket_refunds;
  v_details      JSONB;
  v_details_orig JSONB;
  v_before_total INTEGER;
  v_after_total  INTEGER;
  v_item         JSONB;
  v_label        TEXT;
  v_idx          INTEGER;
  v_cur          JSONB;
  v_mat          RECORD;
  v_done         TEXT[] := ARRAY[]::TEXT[];
  v_skipped      TEXT[] := ARRAY[]::TEXT[];
  v_msg          TEXT;
BEGIN
  SELECT * INTO v_r FROM ticket_refunds WHERE id = p_refund_id;
  IF NOT FOUND
     OR jsonb_typeof(v_r.material_adjustments) IS DISTINCT FROM 'array'
     OR jsonb_array_length(v_r.material_adjustments) = 0 THEN
    RETURN;
  END IF;

  SELECT CASE WHEN jsonb_typeof(material_cost_details) = 'array'
              THEN material_cost_details ELSE '[]'::jsonb END,
         material_cost
    INTO v_details, v_before_total
  FROM repair_tickets
  WHERE id = v_r.ticket_id
  FOR UPDATE;

  v_details_orig := v_details;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_r.material_adjustments) LOOP
    v_label := COALESCE(v_item->>'description', v_item->>'label', '자재');

    CASE v_item->>'kind'

    WHEN 'manual' THEN
      v_idx := (v_item->>'index')::int;
      v_cur := v_details -> v_idx;

      IF NOT p_revert THEN
        IF v_cur IS NULL
           OR (v_cur->>'description') IS DISTINCT FROM (v_item->>'description')
           OR (v_cur->>'amount')::numeric IS DISTINCT FROM (v_item->>'before')::numeric THEN
          RAISE EXCEPTION '환불 요청 이후 자재비 항목 "%"이(가) 변경되었습니다. 이 환불을 반려하고 다시 요청해 주세요.', v_label;
        END IF;
        v_details := jsonb_set(v_details, ARRAY[v_idx::text, 'amount'], to_jsonb((v_item->>'after')::int));
        v_done := v_done || format('%s %s원→%s원', v_label,
          to_char((v_item->>'before')::int, 'FM999,999,999,990'),
          to_char((v_item->>'after')::int,  'FM999,999,999,990'));
      ELSE
        IF v_cur IS NOT NULL
           AND (v_cur->>'description') IS NOT DISTINCT FROM (v_item->>'description')
           AND (v_cur->>'amount')::numeric = (v_item->>'after')::numeric THEN
          v_details := jsonb_set(v_details, ARRAY[v_idx::text, 'amount'], to_jsonb((v_item->>'before')::int));
          v_done := v_done || format('%s %s원 복구', v_label,
            to_char((v_item->>'before')::int, 'FM999,999,999,990'));
        ELSE
          v_skipped := v_skipped || format('%s(이후 금액이 변경됨)', v_label);
        END IF;
      END IF;

    WHEN 'inventory_price' THEN
      SELECT m.request_status::text AS status,
             m.override_unit_price,
             COALESCE(m.override_unit_price, i.base_estimate, 0) AS unit_price
        INTO v_mat
      FROM ticket_materials m
      LEFT JOIN inventory_items i ON i.id = m.inventory_item_id
      WHERE m.id = (v_item->>'material_id')::uuid AND m.ticket_id = v_r.ticket_id
      FOR UPDATE OF m;

      IF NOT p_revert THEN
        IF NOT FOUND THEN
          RAISE EXCEPTION '환불 요청 이후 자재 "%"이(가) 삭제되었습니다. 이 환불을 반려하고 다시 요청해 주세요.', v_label;
        END IF;
        IF v_mat.status <> 'approved' OR v_mat.unit_price <> (v_item->>'before_unit')::int THEN
          RAISE EXCEPTION '환불 요청 이후 자재 "%"의 상태나 단가가 변경되었습니다. 이 환불을 반려하고 다시 요청해 주세요.', v_label;
        END IF;
        UPDATE ticket_materials
        SET override_unit_price = (v_item->>'after_unit')::int
        WHERE id = (v_item->>'material_id')::uuid;
        v_done := v_done || format('%s 단가 %s원→%s원', v_label,
          to_char((v_item->>'before_unit')::int, 'FM999,999,999,990'),
          to_char((v_item->>'after_unit')::int,  'FM999,999,999,990'));
      ELSE
        IF FOUND AND v_mat.override_unit_price IS NOT DISTINCT FROM (v_item->>'after_unit')::int THEN
          UPDATE ticket_materials
          SET override_unit_price = (v_item->>'before_override')::int
          WHERE id = (v_item->>'material_id')::uuid;
          v_done := v_done || format('%s 단가 %s원 복구', v_label,
            to_char((v_item->>'before_unit')::int, 'FM999,999,999,990'));
        ELSE
          v_skipped := v_skipped || format('%s(이후 단가가 변경됨)', v_label);
        END IF;
      END IF;

    WHEN 'inventory_recover' THEN
      SELECT m.request_status::text AS status
        INTO v_mat
      FROM ticket_materials m
      WHERE m.id = (v_item->>'material_id')::uuid AND m.ticket_id = v_r.ticket_id
      FOR UPDATE;

      IF NOT p_revert THEN
        IF NOT FOUND THEN
          RAISE EXCEPTION '환불 요청 이후 자재 "%"이(가) 삭제되었습니다. 이 환불을 반려하고 다시 요청해 주세요.', v_label;
        END IF;
        IF v_mat.status <> 'approved' THEN
          RAISE EXCEPTION '환불 요청 이후 자재 "%"의 상태가 변경되었습니다. (현재: %) 이 환불을 반려하고 다시 요청해 주세요.', v_label, v_mat.status;
        END IF;
        UPDATE ticket_materials
        SET request_status = 'cancel_requested'
        WHERE id = (v_item->>'material_id')::uuid;
        v_done := v_done || format('%s 회수(반환 확인 대기)', v_label);
      ELSE
        IF FOUND AND v_mat.status = 'cancel_requested' THEN
          UPDATE ticket_materials
          SET request_status = 'approved'
          WHERE id = (v_item->>'material_id')::uuid;
          v_done := v_done || format('%s 회수 취소', v_label);
        ELSIF FOUND AND v_mat.status = 'cancelled' THEN
          v_skipped := v_skipped || format('%s(반환 확인이 끝나 재고로 복구됨)', v_label);
        ELSE
          v_skipped := v_skipped || format('%s(이후 상태가 변경됨)', v_label);
        END IF;
      END IF;

    ELSE
      RAISE EXCEPTION '알 수 없는 자재비 수정 유형입니다: %', v_item->>'kind';
    END CASE;
  END LOOP;

  IF v_details IS DISTINCT FROM v_details_orig THEN
    PERFORM set_config('app.refund_sync', 'on', true);
    UPDATE repair_tickets SET material_cost_details = v_details WHERE id = v_r.ticket_id;
    PERFORM set_config('app.refund_sync', 'off', true);
  END IF;

  v_after_total := recalc_ticket_material_cost(v_r.ticket_id);

  v_msg := format('시스템: %s (%s자재비 합계 %s원 → %s원)',
    CASE WHEN p_revert
         THEN format('환불 %s 무효처리로 자재비 수정을 되돌렸습니다.', v_r.refund_no)
         ELSE format('환불 %s 완료로 자재비 수정이 반영되었습니다.', v_r.refund_no)
    END,
    CASE WHEN array_length(v_done, 1) > 0 THEN array_to_string(v_done, ', ') || ', ' ELSE '' END,
    to_char(v_before_total, 'FM999,999,999,990'),
    to_char(v_after_total,  'FM999,999,999,990'));

  IF array_length(v_skipped, 1) > 0 THEN
    v_msg := v_msg || ' 되돌리지 못한 항목: ' || array_to_string(v_skipped, ', ');
  END IF;

  INSERT INTO ticket_logs (ticket_id, employee_id, message)
  VALUES (v_r.ticket_id, auth.uid(), v_msg);
END;
$$;


ALTER FUNCTION "public"."apply_refund_material_adjustments"("p_refund_id" "uuid", "p_revert" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_material_dispatch"("p_material_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_item_id      UUID;
  v_ticket_id    UUID;
  v_quantity     INTEGER;
  v_status       TEXT;
  v_inv_qty      INTEGER;
  v_requester_id UUID;   -- 자재를 요청한 담당기사 ID
BEGIN
  -- 1) ticket_materials 조회 (created_by = 요청자)
  SELECT inventory_item_id, ticket_id, quantity, request_status, created_by
    INTO v_item_id, v_ticket_id, v_quantity, v_status, v_requester_id
    FROM ticket_materials
   WHERE id = p_material_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '자재 요청을 찾을 수 없습니다.');
  END IF;

  -- request_status가 'requested' 또는 'pending'인 경우 모두 허용 (기존 데이터 호환)
  IF v_status NOT IN ('requested', 'pending') THEN
    RETURN jsonb_build_object('error', '출고 요청 상태가 아닙니다. (현재: ' || v_status || ')');
  END IF;

  -- 2) 재고 수량 확인
  SELECT quantity INTO v_inv_qty
    FROM inventory_items
   WHERE id = v_item_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', '재고 아이템을 찾을 수 없습니다.');
  END IF;

  IF v_inv_qty < v_quantity THEN
    RETURN jsonb_build_object('error', '재고 부족 (현재 ' || v_inv_qty || '개, 요청 ' || v_quantity || '개)');
  END IF;

  -- 3) 재고 차감
  UPDATE inventory_items
     SET quantity   = quantity - v_quantity,
         updated_at = now()
   WHERE id = v_item_id;

  -- 4) ticket_materials 승인 처리
  UPDATE ticket_materials
     SET request_status = 'approved',
         updated_at     = now()
   WHERE id = p_material_id;

  -- 5) inventory_transactions OUTBOUND 기록 (담당자 = 자재 요청자 created_by)
  INSERT INTO inventory_transactions (
    item_id,
    user_id,
    transaction_type,
    quantity_changed,
    ticket_id,
    notes
  ) VALUES (
    v_item_id,
    COALESCE(v_requester_id, p_user_id),  -- 요청자 우선, 없으면 승인자
    'OUTBOUND',
    v_quantity,
    v_ticket_id,
    '자재 출고 승인'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;


ALTER FUNCTION "public"."approve_material_dispatch"("p_material_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."approve_material_dispatch"("p_material_id" "uuid", "p_user_id" "uuid") IS '자재 출고 승인: 재고 차감 + 상태 변경 + OUTBOUND 트랜잭션 기록을 단일 트랜잭션으로 처리';



CREATE OR REPLACE FUNCTION "public"."enforce_minimum_price"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- final_price가 변경되지 않았으면 통과
  IF NEW.final_price = OLD.final_price THEN
    RETURN NEW;
  END IF;

  -- final_price가 0이면 아직 미입력 상태이므로 통과
  IF NEW.final_price = 0 THEN
    RETURN NEW;
  END IF;

  -- 최소 견적보다 낮은 금액 입력 시 차단
  IF NEW.final_price < NEW.initial_estimate THEN
    RAISE EXCEPTION '최종 견적(%)이 최소 견적(%)보다 낮습니다. 팀장의 예외 승인이 필요합니다.',
      NEW.final_price, NEW.initial_estimate;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_minimum_price"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_receipt_no"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_date DATE;
  v_seq  INTEGER;
BEGIN
  IF NEW.receipt_no IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_date := (NEW.created_at AT TIME ZONE 'Asia/Seoul')::DATE;

  INSERT INTO receipt_no_sequence(date_key, current_seq)
  VALUES (v_date, 1)
  ON CONFLICT (date_key) DO UPDATE
    SET current_seq = receipt_no_sequence.current_seq + 1
  RETURNING current_seq INTO v_seq;

  NEW.receipt_no := to_char(v_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_receipt_no"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_refund_no"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_date DATE;
  v_seq  INTEGER;
BEGIN
  IF NEW.refund_no IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_date := (now() AT TIME ZONE 'Asia/Seoul')::DATE;

  INSERT INTO refund_no_sequence(date_key, current_seq)
  VALUES (v_date, 1)
  ON CONFLICT (date_key) DO UPDATE
    SET current_seq = refund_no_sequence.current_seq + 1
  RETURNING current_seq INTO v_seq;

  NEW.refund_no := 'R-' || to_char(v_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 3, '0');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_refund_no"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_role"() RETURNS "public"."employee_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT role FROM employees WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_my_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."news_items_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."news_items_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."page_contents_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."page_contents_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_approved_ticket"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_role employee_role;
  new_other repair_tickets;
BEGIN
  IF OLD.is_approved = FALSE THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.refund_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;

  new_other := NEW;
  new_other.has_admin_message := OLD.has_admin_message;
  new_other.updated_at := OLD.updated_at;
  IF new_other IS NOT DISTINCT FROM OLD THEN
    RETURN NEW;
  END IF;

  SELECT role INTO current_role
  FROM employees
  WHERE id = auth.uid();

  IF current_role = 'ADMIN' THEN
    RETURN NEW;
  END IF;

  IF current_role = 'MANAGER' THEN
    IF NEW.final_price <> OLD.final_price THEN
      RAISE EXCEPTION '승인 완료된 접수건의 금액은 수정할 수 없습니다.';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '승인 완료된 접수건은 수정할 수 없습니다. (권한: %)' , current_role;
END;
$$;


ALTER FUNCTION "public"."protect_approved_ticket"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_canceled_ticket"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role employee_role;
BEGIN
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
$$;


ALTER FUNCTION "public"."protect_canceled_ticket"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_ticket_material_cost"("p_ticket_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_inventory INTEGER;
  v_manual    INTEGER;
  v_total     INTEGER;
BEGIN
  SELECT COALESCE(SUM(COALESCE(m.override_unit_price, i.base_estimate, 0) * m.quantity), 0)::int
    INTO v_inventory
  FROM ticket_materials m
  LEFT JOIN inventory_items i ON i.id = m.inventory_item_id
  WHERE m.ticket_id = p_ticket_id
    AND m.request_status IN ('approved', 'cancel_requested');

  SELECT COALESCE(SUM((x->>'amount')::numeric), 0)::int
    INTO v_manual
  FROM repair_tickets t
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(t.material_cost_details) = 'array'
         THEN t.material_cost_details ELSE '[]'::jsonb END
  ) x
  WHERE t.id = p_ticket_id;

  v_total := v_inventory + v_manual;

  PERFORM set_config('app.refund_sync', 'on', true);
  UPDATE repair_tickets
  SET material_cost = v_total
  WHERE id = p_ticket_id AND material_cost IS DISTINCT FROM v_total;
  PERFORM set_config('app.refund_sync', 'off', true);

  RETURN v_total;
END;
$$;


ALTER FUNCTION "public"."recalc_ticket_material_cost"("p_ticket_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ticket_refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "refund_no" character varying(24) NOT NULL,
    "amount" integer NOT NULL,
    "deduction_amount" integer DEFAULT 0 NOT NULL,
    "deduction_note" "text",
    "reason_code" "public"."refund_reason" NOT NULL,
    "reason_note" "text",
    "origin_payment_method" character varying(20) NOT NULL,
    "refund_method" "public"."refund_method" NOT NULL,
    "refund_bank" character varying(50),
    "refund_account" character varying(50),
    "refund_holder" character varying(100),
    "cash_receipt_cancel_required" boolean DEFAULT false NOT NULL,
    "cash_receipt_canceled_at" timestamp with time zone,
    "parts_recovery" "public"."parts_recovery" DEFAULT 'NONE'::"public"."parts_recovery" NOT NULL,
    "status" "public"."refund_status" DEFAULT 'REQUESTED'::"public"."refund_status" NOT NULL,
    "evidence" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "completed_by" "uuid",
    "completed_at" timestamp with time zone,
    "rejected_by" "uuid",
    "rejected_at" timestamp with time zone,
    "reject_note" "text",
    "voided_by" "uuid",
    "voided_at" timestamp with time zone,
    "void_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "material_adjustments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    CONSTRAINT "chk_cash_receipt_cancel" CHECK ((("status" <> 'COMPLETED'::"public"."refund_status") OR ("cash_receipt_cancel_required" = false) OR ("cash_receipt_canceled_at" IS NOT NULL))),
    CONSTRAINT "chk_deduction_note" CHECK ((("deduction_amount" = 0) OR (("deduction_note" IS NOT NULL) AND ("btrim"("deduction_note") <> ''::"text")))),
    CONSTRAINT "chk_reason_note" CHECK ((("reason_code" <> 'OTHER'::"public"."refund_reason") OR (("reason_note" IS NOT NULL) AND ("btrim"("reason_note") <> ''::"text")))),
    CONSTRAINT "chk_refund_bank_fields" CHECK (((("refund_method" = 'BANK_REFUND'::"public"."refund_method") AND ("refund_bank" IS NOT NULL) AND ("refund_account" IS NOT NULL) AND ("refund_holder" IS NOT NULL)) OR (("refund_method" <> 'BANK_REFUND'::"public"."refund_method") AND ("refund_bank" IS NULL) AND ("refund_account" IS NULL) AND ("refund_holder" IS NULL)))),
    CONSTRAINT "ticket_refunds_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "ticket_refunds_deduction_amount_check" CHECK (("deduction_amount" >= 0))
);


ALTER TABLE "public"."ticket_refunds" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_refunds" IS '환불 원장 (append-only). 수정·삭제하지 않으며, 오등록은 VOID 레코드로 무효화한 뒤 재등록한다.';



COMMENT ON COLUMN "public"."ticket_refunds"."material_adjustments" IS '자재비 수정안 (요청 시점 스냅샷 포함). kind: manual | inventory_price | inventory_recover. 환불 완료 시 반영, 완료 후 무효처리 시 되돌림';



CREATE OR REPLACE FUNCTION "public"."request_refund"("p_ticket_id" "uuid", "p_amount" integer, "p_reason_code" "public"."refund_reason", "p_refund_method" "public"."refund_method", "p_reason_note" "text" DEFAULT NULL::"text", "p_refund_bank" "text" DEFAULT NULL::"text", "p_refund_account" "text" DEFAULT NULL::"text", "p_refund_holder" "text" DEFAULT NULL::"text", "p_material_adjustments" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "public"."ticket_refunds"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me        UUID := auth.uid();
  v_role      employee_role;
  v_ticket    repair_tickets;
  v_committed INTEGER;
  v_available INTEGER;
  v_row       ticket_refunds;
  v_bank      TEXT := NULLIF(btrim(p_refund_bank), '');
  v_account   TEXT := NULLIF(btrim(p_refund_account), '');
  v_holder    TEXT := NULLIF(btrim(p_refund_holder), '');
  v_reason    TEXT := NULLIF(btrim(p_reason_note), '');
  v_input     JSONB := COALESCE(p_material_adjustments, '[]'::jsonb);
  v_details   JSONB;
  v_item      JSONB;
  v_adj       JSONB := '[]'::jsonb;
  v_keys      TEXT[] := ARRAY[]::TEXT[];
  v_key       TEXT;
  v_idx       INTEGER;
  v_after     INTEGER;
  v_cur       JSONB;
  v_mat       RECORD;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  SELECT role INTO v_role FROM employees WHERE id = v_me;
  IF v_role IS NULL OR v_role NOT IN ('ADMIN', 'MANAGER', 'CS') THEN
    RAISE EXCEPTION '환불을 요청할 권한이 없습니다. (권한: %)', COALESCE(v_role::text, '없음');
  END IF;

  SELECT * INTO v_ticket FROM repair_tickets WHERE id = p_ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '접수건을 찾을 수 없습니다.';
  END IF;

  IF v_ticket.status <> 'COMPLETED' THEN
    RAISE EXCEPTION '완료된 접수건만 환불할 수 있습니다. (현재 상태: %)', v_ticket.status;
  END IF;

  IF v_ticket.final_price <= 0 THEN
    RAISE EXCEPTION '결제 금액이 없는 접수건입니다.';
  END IF;

  IF v_ticket.refunded_amount >= v_ticket.final_price THEN
    RAISE EXCEPTION '이미 전액 환불된 접수건입니다. 환불 완료 건은 종결 처리되어 추가 요청을 받지 않습니다.';
  END IF;

  IF v_ticket.completed_at IS NOT NULL
     AND v_ticket.completed_at < now() - INTERVAL '30 days'
     AND v_role <> 'ADMIN' THEN
    RAISE EXCEPTION '완료 후 30일이 지난 접수건(완료일 %)은 관리자만 환불을 요청할 수 있습니다.',
      to_char(v_ticket.completed_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '환불 금액은 0원보다 커야 합니다.';
  END IF;

  IF p_refund_method = 'BANK_REFUND'
     AND (v_bank IS NULL OR v_account IS NULL OR v_holder IS NULL) THEN
    RAISE EXCEPTION '계좌 송금 환불은 은행 · 계좌번호 · 예금주를 모두 입력해야 합니다.';
  END IF;

  IF p_refund_method <> 'BANK_REFUND'
     AND (v_bank IS NOT NULL OR v_account IS NOT NULL OR v_holder IS NOT NULL) THEN
    RAISE EXCEPTION '계좌 송금이 아닌 환불에는 계좌 정보를 입력할 수 없습니다.';
  END IF;

  IF p_reason_code = 'OTHER' AND v_reason IS NULL THEN
    RAISE EXCEPTION '기타 사유를 선택한 경우 상세 사유를 입력해야 합니다.';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_committed
  FROM ticket_refunds
  WHERE ticket_id = p_ticket_id
    AND status IN ('REQUESTED', 'APPROVED', 'COMPLETED');

  v_available := v_ticket.final_price - v_committed;

  IF p_amount > v_available THEN
    RAISE EXCEPTION '환불 가능액 %원을 초과했습니다. (결제금액 %원 − 기환불·처리중 %원)',
      v_available, v_ticket.final_price, v_committed;
  END IF;

  IF v_ticket.payment_method IN ('CARD', 'E_PAYMENT')
     AND p_refund_method NOT IN ('CARD_CANCEL', 'CARD_PARTIAL_CANCEL') THEN
    RAISE EXCEPTION '카드·간편결제 건은 승인취소 또는 부분취소로만 환불할 수 있습니다.';
  END IF;

  IF v_ticket.payment_method = 'BANK_TRANSFER'
     AND p_refund_method NOT IN ('BANK_REFUND', 'CASH') THEN
    RAISE EXCEPTION '계좌이체 건은 계좌 송금 또는 현금 반환으로만 환불할 수 있습니다.';
  END IF;

  IF p_refund_method = 'CARD_CANCEL' AND p_amount <> v_ticket.final_price THEN
    RAISE EXCEPTION '카드 승인취소(전액)는 결제 전액을 환불할 때만 선택할 수 있습니다. 부분 환불은 부분취소를 선택해 주세요.';
  END IF;

  IF jsonb_typeof(v_input) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION '자재비 수정 내역 형식이 올바르지 않습니다.';
  END IF;

  IF jsonb_array_length(v_input) > 0 AND EXISTS (
    SELECT 1 FROM ticket_refunds
    WHERE ticket_id = p_ticket_id
      AND status IN ('REQUESTED', 'APPROVED')
      AND jsonb_array_length(material_adjustments) > 0
  ) THEN
    RAISE EXCEPTION '자재비 수정이 포함된 다른 환불이 처리 중입니다. 먼저 완료하거나 반려한 뒤 요청해 주세요.';
  END IF;

  v_details := CASE WHEN jsonb_typeof(v_ticket.material_cost_details) = 'array'
                    THEN v_ticket.material_cost_details ELSE '[]'::jsonb END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_input) LOOP

    IF v_item->>'kind' = 'manual' THEN
      IF jsonb_typeof(v_item->'index') IS DISTINCT FROM 'number'
         OR jsonb_typeof(v_item->'after') IS DISTINCT FROM 'number' THEN
        RAISE EXCEPTION '수정할 자재비 금액을 입력해 주세요.';
      END IF;
      v_idx := (v_item->>'index')::int;
      v_cur := CASE WHEN v_idx >= 0 THEN v_details -> v_idx END;
      IF v_cur IS NULL THEN
        RAISE EXCEPTION '자재비 항목을 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.';
      END IF;
      v_after := round((v_item->>'after')::numeric)::int;
      IF v_after < 0 OR v_after >= (v_cur->>'amount')::numeric THEN
        RAISE EXCEPTION '자재비 "%"은(는) 0원 이상, 현재 금액(%원)보다 낮게만 수정할 수 있습니다.',
          v_cur->>'description', v_cur->>'amount';
      END IF;
      v_key := 'manual:' || v_idx;
      v_adj := v_adj || jsonb_build_array(jsonb_build_object(
        'kind', 'manual',
        'index', v_idx,
        'description', v_cur->>'description',
        'before', round((v_cur->>'amount')::numeric)::int,
        'after', v_after
      ));

    ELSIF v_item->>'kind' IN ('inventory_price', 'inventory_recover') THEN
      IF jsonb_typeof(v_item->'material_id') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION '재고 자재 항목이 지정되지 않았습니다.';
      END IF;

      SELECT m.id,
             m.request_status::text AS status,
             m.quantity,
             m.request_type,
             m.override_unit_price,
             COALESCE(m.override_unit_price, i.base_estimate, 0) AS unit_price,
             COALESCE(s.name = '외주' OR c.name = '소프트웨어', FALSE) AS non_physical,
             concat_ws(' / ', c.name, s.name, p.name, i.capacity) AS label
        INTO v_mat
      FROM ticket_materials m
      LEFT JOIN inventory_items i      ON i.id = m.inventory_item_id
      LEFT JOIN inventory_categories c ON c.id = i.category_id
      LEFT JOIN inventory_specs s      ON s.id = i.spec_id
      LEFT JOIN inventory_products p   ON p.id = i.product_id
      WHERE m.id = (v_item->>'material_id')::uuid
        AND m.ticket_id = p_ticket_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION '재고 자재 항목을 찾을 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.';
      END IF;

      IF v_mat.status <> 'approved' THEN
        RAISE EXCEPTION '사용 확정된 자재만 수정할 수 있습니다. ("%" 현재 상태: %)', v_mat.label, v_mat.status;
      END IF;

      v_key := 'material:' || v_mat.id;

      IF v_item->>'kind' = 'inventory_price' THEN
        IF NOT v_mat.non_physical THEN
          RAISE EXCEPTION '"%"은(는) 실물 자재라 금액 대신 회수 여부로 처리합니다.', v_mat.label;
        END IF;
        IF jsonb_typeof(v_item->'after') IS DISTINCT FROM 'number' THEN
          RAISE EXCEPTION '수정할 자재비 금액을 입력해 주세요.';
        END IF;
        v_after := round((v_item->>'after')::numeric)::int;
        IF v_after < 0 OR v_after >= v_mat.unit_price THEN
          RAISE EXCEPTION '"%"은(는) 0원 이상, 현재 단가(%원)보다 낮게만 수정할 수 있습니다.', v_mat.label, v_mat.unit_price;
        END IF;
        v_adj := v_adj || jsonb_build_array(jsonb_build_object(
          'kind', 'inventory_price',
          'material_id', v_mat.id,
          'label', v_mat.label,
          'quantity', v_mat.quantity,
          'before_unit', v_mat.unit_price,
          'before_override', v_mat.override_unit_price,
          'after_unit', v_after
        ));
      ELSE
        IF v_mat.non_physical THEN
          RAISE EXCEPTION '"%"은(는) 실물이 없는 자재라 회수할 수 없습니다. 금액 수정으로 처리해 주세요.', v_mat.label;
        END IF;
        v_adj := v_adj || jsonb_build_array(jsonb_build_object(
          'kind', 'inventory_recover',
          'material_id', v_mat.id,
          'label', v_mat.label,
          'quantity', v_mat.quantity,
          'unit_price', v_mat.unit_price,
          'request_type', v_mat.request_type
        ));
      END IF;

    ELSE
      RAISE EXCEPTION '알 수 없는 자재비 수정 유형입니다: %', v_item->>'kind';
    END IF;

    IF v_key = ANY(v_keys) THEN
      RAISE EXCEPTION '같은 자재비 항목을 두 번 수정할 수 없습니다.';
    END IF;
    v_keys := v_keys || v_key;
  END LOOP;

  INSERT INTO ticket_refunds (
    ticket_id, amount,
    reason_code, reason_note,
    origin_payment_method, refund_method,
    refund_bank, refund_account, refund_holder,
    cash_receipt_cancel_required,
    material_adjustments,
    status, requested_by
  ) VALUES (
    p_ticket_id, p_amount,
    p_reason_code, v_reason,
    COALESCE(v_ticket.payment_method, 'UNKNOWN'), p_refund_method,
    v_bank, v_account, v_holder,
    (v_ticket.payment_method = 'BANK_TRANSFER' AND v_ticket.cash_receipt_issued IS TRUE),
    v_adj,
    'REQUESTED', v_me
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."request_refund"("p_ticket_id" "uuid", "p_amount" integer, "p_reason_code" "public"."refund_reason", "p_refund_method" "public"."refund_method", "p_reason_note" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text", "p_material_adjustments" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_ticket_refunded_amount"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_ticket_id UUID;
  v_total     INTEGER;
  v_final     INTEGER;
BEGIN
  v_ticket_id := COALESCE(NEW.ticket_id, OLD.ticket_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM ticket_refunds
  WHERE ticket_id = v_ticket_id AND status = 'COMPLETED';

  SELECT final_price INTO v_final
  FROM repair_tickets
  WHERE id = v_ticket_id;

  PERFORM set_config('app.refund_sync', 'on', true);

  UPDATE repair_tickets
  SET refunded_amount = v_total,
      payment_status = CASE
        WHEN v_total <= 0       THEN 'PAID'::payment_status
        WHEN v_total >= v_final THEN 'REFUNDED'::payment_status
        ELSE 'PARTIALLY_REFUNDED'::payment_status
      END
  WHERE id = v_ticket_id;

  PERFORM set_config('app.refund_sync', 'off', true);

  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."sync_ticket_refunded_amount"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transition_refund"("p_refund_id" "uuid", "p_action" "text", "p_note" "text" DEFAULT NULL::"text", "p_cash_receipt_canceled" boolean DEFAULT false) RETURNS "public"."ticket_refunds"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_me   UUID := auth.uid();
  v_role employee_role;
  v_r    ticket_refunds;
  v_row  ticket_refunds;
  v_note TEXT := NULLIF(btrim(p_note), '');
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  SELECT role INTO v_role FROM employees WHERE id = v_me;
  IF v_role IS NULL THEN
    RAISE EXCEPTION '직원 정보를 찾을 수 없습니다.';
  END IF;

  SELECT * INTO v_r FROM ticket_refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '환불 내역을 찾을 수 없습니다.';
  END IF;

  IF p_action = 'APPROVE' THEN
    IF v_role NOT IN ('ADMIN', 'MANAGER') THEN
      RAISE EXCEPTION '환불 승인 권한이 없습니다. (권한: %)', v_role;
    END IF;
    IF v_r.status <> 'REQUESTED' THEN
      RAISE EXCEPTION '요청 상태의 환불만 승인할 수 있습니다. (현재: %)', v_r.status;
    END IF;
    IF v_r.requested_by = v_me AND v_role <> 'ADMIN' THEN
      RAISE EXCEPTION '본인이 요청한 환불은 본인이 승인할 수 없습니다.';
    END IF;

    UPDATE ticket_refunds
    SET status = 'APPROVED', approved_by = v_me, approved_at = now()
    WHERE id = p_refund_id
    RETURNING * INTO v_row;

  ELSIF p_action = 'REJECT' THEN
    IF v_role NOT IN ('ADMIN', 'MANAGER') THEN
      RAISE EXCEPTION '환불 반려 권한이 없습니다. (권한: %)', v_role;
    END IF;
    IF v_r.status <> 'REQUESTED' THEN
      RAISE EXCEPTION '요청 상태의 환불만 반려할 수 있습니다. (현재: %)', v_r.status;
    END IF;
    IF v_note IS NULL THEN
      RAISE EXCEPTION '반려 사유를 입력해 주세요.';
    END IF;

    UPDATE ticket_refunds
    SET status = 'REJECTED', rejected_by = v_me, rejected_at = now(), reject_note = v_note
    WHERE id = p_refund_id
    RETURNING * INTO v_row;

  ELSIF p_action = 'COMPLETE' THEN
    IF v_role NOT IN ('ADMIN', 'MANAGER', 'CS') THEN
      RAISE EXCEPTION '환불 완료 처리 권한이 없습니다. (권한: %)', v_role;
    END IF;
    IF v_r.status <> 'APPROVED' THEN
      RAISE EXCEPTION '승인된 환불만 완료 처리할 수 있습니다. (현재: %)', v_r.status;
    END IF;
    IF v_r.cash_receipt_cancel_required AND NOT COALESCE(p_cash_receipt_canceled, FALSE) THEN
      RAISE EXCEPTION '현금영수증 발급 건입니다. 발급취소를 완료한 뒤 확인 체크와 함께 처리해 주세요.';
    END IF;

    UPDATE ticket_refunds
    SET status = 'COMPLETED',
        completed_by = v_me,
        completed_at = now(),
        cash_receipt_canceled_at = CASE
          WHEN v_r.cash_receipt_cancel_required THEN now()
          ELSE cash_receipt_canceled_at
        END
    WHERE id = p_refund_id
    RETURNING * INTO v_row;

    PERFORM apply_refund_material_adjustments(p_refund_id, FALSE);

  ELSIF p_action = 'VOID' THEN
    IF v_role <> 'ADMIN' THEN
      RAISE EXCEPTION '환불 무효처리는 관리자만 할 수 있습니다. (권한: %)', v_role;
    END IF;
    IF v_r.status NOT IN ('APPROVED', 'COMPLETED') THEN
      RAISE EXCEPTION '승인 또는 완료된 환불만 무효처리할 수 있습니다. (현재: %)', v_r.status;
    END IF;
    IF v_note IS NULL THEN
      RAISE EXCEPTION '무효처리 사유를 입력해 주세요.';
    END IF;

    UPDATE ticket_refunds
    SET status = 'VOID', voided_by = v_me, voided_at = now(), void_note = v_note
    WHERE id = p_refund_id
    RETURNING * INTO v_row;

    IF v_r.status = 'COMPLETED' THEN
      PERFORM apply_refund_material_adjustments(p_refund_id, TRUE);
    END IF;

  ELSE
    RAISE EXCEPTION '알 수 없는 처리 유형입니다: %', p_action;
  END IF;

  RETURN v_row;
END;
$$;


ALTER FUNCTION "public"."transition_refund"("p_refund_id" "uuid", "p_action" "text", "p_note" "text", "p_cash_receipt_canceled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_inventory_items_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_inventory_items_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_ticket_materials_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_ticket_materials_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "phone" character varying(20) NOT NULL,
    "address" character varying(300),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


COMMENT ON TABLE "public"."customers" IS '고객 정보 테이블';



CREATE TABLE IF NOT EXISTS "public"."device_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "brand" character varying(50) NOT NULL,
    "model_name" character varying(200) NOT NULL,
    "release_year" integer,
    "release_price" integer,
    "specs" "jsonb",
    "min_repair_cost" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tag_info" "text"
);


ALTER TABLE "public"."device_models" OWNER TO "postgres";


COMMENT ON TABLE "public"."device_models" IS '브랜드별 모델 정보 (최소 견적 자동 산출용)';



COMMENT ON COLUMN "public"."device_models"."tag_info" IS '기기 라벨 태그 정보 (예: 15ZD90RU-GX56K) — AI 검색 키워드';



CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" NOT NULL,
    "name" character varying(100) NOT NULL,
    "role" "public"."employee_role" NOT NULL,
    "phone" character varying(20),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_assignable" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


COMMENT ON TABLE "public"."employees" IS '직원 프로필 테이블 - auth.users와 1:1 매핑';



COMMENT ON COLUMN "public"."employees"."is_assignable" IS '담당자 배정 목록 포함 여부 (TECHNICIAN/EXPERT_REPAIR 대상). true=배정 가능, false=배정 목록에서 제외(이력 보존)';



CREATE TABLE IF NOT EXISTS "public"."global_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "base_service_cost" numeric DEFAULT 0 NOT NULL,
    "value_reference_amount" numeric DEFAULT 0 NOT NULL,
    "discount_surcharge_rate" numeric DEFAULT 100 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "global_settings_id_check" CHECK (("id" = true))
);


ALTER TABLE "public"."global_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."global_settings" IS '시스템 전역 설정 (단일 row)';



COMMENT ON COLUMN "public"."global_settings"."base_service_cost" IS '기본 서비스 비용 (원)';



COMMENT ON COLUMN "public"."global_settings"."value_reference_amount" IS '가치 기준 금액 (원)';



COMMENT ON COLUMN "public"."global_settings"."discount_surcharge_rate" IS '할인/할증 비율 (%, 기본 100)';



CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_name" character varying(200) NOT NULL,
    "condition" "public"."inventory_condition" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "cost_price" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory" IS '교환품, 불량품, 잉여 부품 자재 관리';



CREATE TABLE IF NOT EXISTS "public"."inventory_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_categories" IS '재고 분류 카테고리 (RAM, 저장장치, 배터리, 액정 등)';



CREATE TABLE IF NOT EXISTS "public"."inventory_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "spec_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "capacity" character varying(50),
    "condition" "public"."item_condition" DEFAULT 'NEW'::"public"."item_condition" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "base_estimate" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_items_base_estimate_check" CHECK (("base_estimate" >= 0)),
    CONSTRAINT "inventory_items_quantity_check" CHECK (("quantity" >= 0))
);


ALTER TABLE "public"."inventory_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_items" IS '재고 아이템 마스터 테이블';



COMMENT ON COLUMN "public"."inventory_items"."capacity" IS '용량/인치수 (예: 8GB, 256GB, 15.6인치)';



COMMENT ON COLUMN "public"."inventory_items"."condition" IS '아이템 상태 (NEW: 신품, USED: 중고품)';



COMMENT ON COLUMN "public"."inventory_items"."base_estimate" IS '기초견적 금액 (원)';



CREATE TABLE IF NOT EXISTS "public"."inventory_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "spec_id" "uuid" NOT NULL,
    "name" character varying(200) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_products" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_products" IS '스펙별 실제 제품 (예: 삼성915m, SK하이닉스 등)';



CREATE TABLE IF NOT EXISTS "public"."inventory_specs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category_id" "uuid" NOT NULL,
    "name" character varying(200) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_specs" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_specs" IS '카테고리별 세부 스펙 (예: DDR4-pc, NVMe SSD 등)';



CREATE TABLE IF NOT EXISTS "public"."inventory_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "transaction_type" "public"."inventory_transaction_type" NOT NULL,
    "quantity_changed" integer NOT NULL,
    "ticket_id" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventory_transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."inventory_transactions" IS '재고 입출고 이력';



COMMENT ON COLUMN "public"."inventory_transactions"."transaction_type" IS 'INBOUND: 입고, OUTBOUND: 출고, ADJUSTMENT: 수동조정';



COMMENT ON COLUMN "public"."inventory_transactions"."quantity_changed" IS '변경 수량 (OUTBOUND이면 양수로 저장, 차감 의미)';



COMMENT ON COLUMN "public"."inventory_transactions"."ticket_id" IS '연관 수리 티켓 (없으면 NULL)';



CREATE TABLE IF NOT EXISTS "public"."news_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "news_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "source" "text" DEFAULT ''::"text" NOT NULL,
    "source_url" "text",
    "summary" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "published_at" timestamp with time zone,
    "updated_by" "uuid",
    CONSTRAINT "news_items_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."news_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."news_items" IS 'IT 최신 뉴스 항목. n8n 이 draft 로 적재, CMS/Telegram 에서 published 로 게시.';



COMMENT ON COLUMN "public"."news_items"."news_date" IS '기사 노출 기준일 (목록 정렬/표시에 사용)';



COMMENT ON COLUMN "public"."news_items"."source" IS '출처 매체명 (예: ZDNet Korea)';



COMMENT ON COLUMN "public"."news_items"."source_url" IS '원문 URL — 중복 수집 차단용 UNIQUE 키';



COMMENT ON COLUMN "public"."news_items"."status" IS 'draft(검수 대기) | published(공개) | archived(폐기/보관)';



COMMENT ON COLUMN "public"."news_items"."updated_by" IS '마지막으로 편집/게시한 직원 (감사 로그)';



CREATE TABLE IF NOT EXISTS "public"."page_contents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_key" character varying(64) NOT NULL,
    "section_key" character varying(64) NOT NULL,
    "content_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid"
);


ALTER TABLE "public"."page_contents" OWNER TO "postgres";


COMMENT ON TABLE "public"."page_contents" IS 'CMS 편집 가능한 페이지/섹션 콘텐츠. (page_key, section_key) 로 식별.';



COMMENT ON COLUMN "public"."page_contents"."page_key" IS '페이지 식별자: ''main'', ''brand:samsung'', ''brand:dell'' 등';



COMMENT ON COLUMN "public"."page_contents"."section_key" IS '섹션 식별자: ''theme'', ''hero'', ''symptoms'', ''intro'' 등';



COMMENT ON COLUMN "public"."page_contents"."content_data" IS '해당 섹션 렌더링에 필요한 임의의 JSON. 컴포넌트 props와 1:1 매핑.';



COMMENT ON COLUMN "public"."page_contents"."updated_by" IS '마지막으로 편집한 직원 (감사 로그)';



CREATE TABLE IF NOT EXISTS "public"."receipt_no_sequence" (
    "date_key" "date" NOT NULL,
    "current_seq" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."receipt_no_sequence" OWNER TO "postgres";


COMMENT ON TABLE "public"."receipt_no_sequence" IS '접수번호 일별 순번 카운터 (YYYYMMDD-NNN의 NNN 부분)';



CREATE TABLE IF NOT EXISTS "public"."refund_no_sequence" (
    "date_key" "date" NOT NULL,
    "current_seq" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."refund_no_sequence" OWNER TO "postgres";


COMMENT ON TABLE "public"."refund_no_sequence" IS '환불번호 일별 순번 카운터 (R-YYYYMMDD-NNN의 NNN 부분)';



CREATE TABLE IF NOT EXISTS "public"."repair_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "assignee_id" "uuid",
    "status" "public"."ticket_status" DEFAULT 'NEW'::"public"."ticket_status" NOT NULL,
    "receipt_type" "public"."receipt_type" NOT NULL,
    "device_brand" character varying(50) NOT NULL,
    "device_model" character varying(200),
    "symptoms" "text" NOT NULL,
    "initial_estimate" integer DEFAULT 0 NOT NULL,
    "final_price" integer DEFAULT 0 NOT NULL,
    "is_approved" boolean DEFAULT false NOT NULL,
    "payment_status" "public"."payment_status" DEFAULT 'PENDING'::"public"."payment_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expected_estimate" integer DEFAULT 0 NOT NULL,
    "material_cost" integer DEFAULT 0 NOT NULL,
    "material_cost_details" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "payment_method" character varying,
    "has_admin_message" boolean DEFAULT false NOT NULL,
    "images" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "device_type" "public"."device_type" DEFAULT '노트북'::"public"."device_type" NOT NULL,
    "evaluated_value" numeric DEFAULT 0,
    "minimum_estimate" numeric DEFAULT 0,
    "confirmed_estimate" numeric DEFAULT 0,
    "tag_info" "text",
    "release_year" "text",
    "cancel_device_disposal" "text",
    "dispose_confirmed_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "canceled_at" timestamp with time zone,
    "receipt_no" character varying(20) NOT NULL,
    "is_test" boolean DEFAULT false NOT NULL,
    "received_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "cash_receipt_issued" boolean,
    "refunded_amount" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "chk_refunded_amount" CHECK ((("refunded_amount" >= 0) AND ("refunded_amount" <= "final_price"))),
    CONSTRAINT "repair_tickets_cancel_device_disposal_check" CHECK (("cancel_device_disposal" = ANY (ARRAY['RETURN'::"text", 'DISPOSE'::"text"])))
);


ALTER TABLE "public"."repair_tickets" OWNER TO "postgres";


COMMENT ON TABLE "public"."repair_tickets" IS '수리 접수건 - 가장 핵심적인 비즈니스 테이블';



COMMENT ON COLUMN "public"."repair_tickets"."tag_info" IS '기기 라벨에서 추출한 태그 정보 (예: 15U780-GA56K)';



COMMENT ON COLUMN "public"."repair_tickets"."release_year" IS '기기 출시 연도 (참고용, 예: 2021)';



COMMENT ON COLUMN "public"."repair_tickets"."cancel_device_disposal" IS '취소 시 기기 처리방법: RETURN(반환), DISPOSE(폐기)';



COMMENT ON COLUMN "public"."repair_tickets"."dispose_confirmed_at" IS '폐기 확인 완료 시각 (관리자 처리)';



COMMENT ON COLUMN "public"."repair_tickets"."completed_at" IS '수리 완료(최종 승인) 처리 시각';



COMMENT ON COLUMN "public"."repair_tickets"."canceled_at" IS '접수 취소 처리 시각';



COMMENT ON COLUMN "public"."repair_tickets"."receipt_no" IS '사람이 읽는 접수번호 (YYYYMMDD-NNN, 한국시간 기준, 일별 리셋)';



COMMENT ON COLUMN "public"."repair_tickets"."is_test" IS '테스트 접수 여부 (TRUE면 통계/일반 화면에서 제외)';



COMMENT ON COLUMN "public"."repair_tickets"."received_at" IS '제품 입고 완료 처리 시각 (NULL=입고 전, NOT NULL=입고 후). 입고 전/후 취소 구분 기준';



COMMENT ON COLUMN "public"."repair_tickets"."paid_at" IS '결제 완료 시각 (최종 승인 시 기록)';



COMMENT ON COLUMN "public"."repair_tickets"."cash_receipt_issued" IS '현금영수증 발급 여부 (계좌이체 건만 입력. NULL=해당없음 또는 미확인)';



COMMENT ON COLUMN "public"."repair_tickets"."refunded_amount" IS 'COMPLETED 상태 환불의 amount 합계. 트리거가 자동 갱신하므로 직접 쓰지 않는다.';



CREATE TABLE IF NOT EXISTS "public"."ticket_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ticket_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_logs" IS '접수건 처리 과정 로그 (타임라인)';



CREATE TABLE IF NOT EXISTS "public"."ticket_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "inventory_item_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "request_status" "public"."material_request_status" DEFAULT 'pending'::"public"."material_request_status" NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_type" "text" DEFAULT 'dispatch'::"text" NOT NULL,
    "is_return_registered" boolean DEFAULT false NOT NULL,
    "return_spec" "text",
    "return_name" "text",
    "return_condition" "text",
    "return_status" "text",
    "return_category_id" "uuid",
    "return_quantity" integer DEFAULT 1 NOT NULL,
    "return_capacity" "text",
    "override_unit_price" integer,
    CONSTRAINT "chk_override_unit_price" CHECK ((("override_unit_price" IS NULL) OR ("override_unit_price" >= 0))),
    CONSTRAINT "ticket_materials_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "ticket_materials_request_type_check" CHECK (("request_type" = ANY (ARRAY['dispatch'::"text", 'purchase'::"text"]))),
    CONSTRAINT "ticket_materials_return_condition_check" CHECK ((("return_condition" IS NULL) OR ("return_condition" = ANY (ARRAY['중고품'::"text", '불량품'::"text"])))),
    CONSTRAINT "ticket_materials_return_quantity_check" CHECK (("return_quantity" > 0)),
    CONSTRAINT "ticket_materials_return_status_check" CHECK ((("return_status" IS NULL) OR ("return_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"]))))
);


ALTER TABLE "public"."ticket_materials" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_materials" IS '수리건별 사용 재고 (자재 요청/승인 관리)';



COMMENT ON COLUMN "public"."ticket_materials"."request_status" IS '자재 요청 상태: pending(대기), requested(요청중), approved(승인완료)';



COMMENT ON COLUMN "public"."ticket_materials"."request_type" IS '요청 유형: dispatch(출고 요청 — 재고 차감), purchase(구매 요청 — 재고 차감 없음)';



COMMENT ON COLUMN "public"."ticket_materials"."is_return_registered" IS '적출/반환 자재 등록 여부';



COMMENT ON COLUMN "public"."ticket_materials"."return_spec" IS '반환 자재 사양 (적출된 부품의 스펙)';



COMMENT ON COLUMN "public"."ticket_materials"."return_name" IS '반환 자재 제품명';



COMMENT ON COLUMN "public"."ticket_materials"."return_condition" IS '반환 자재 상태: 중고품, 불량품';



COMMENT ON COLUMN "public"."ticket_materials"."return_status" IS '반환 입고 승인 상태: pending(대기), approved(승인), rejected(거부)';



COMMENT ON COLUMN "public"."ticket_materials"."return_quantity" IS '적출/반환 자재 수량 (기본값 1)';



COMMENT ON COLUMN "public"."ticket_materials"."return_capacity" IS '적출품 등록 시 선택한 재고 아이템의 용량 (예: 256GB, 128GB)';



COMMENT ON COLUMN "public"."ticket_materials"."override_unit_price" IS '이 접수건에만 적용하는 단가. NULL이면 inventory_items.base_estimate 사용 (환불 시 외주·소프트웨어 자재 금액 조정용)';



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_models"
    ADD CONSTRAINT "device_models_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."global_settings"
    ADD CONSTRAINT "global_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_categories"
    ADD CONSTRAINT "inventory_categories_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."inventory_categories"
    ADD CONSTRAINT "inventory_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_products"
    ADD CONSTRAINT "inventory_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_products"
    ADD CONSTRAINT "inventory_products_spec_id_name_key" UNIQUE ("spec_id", "name");



ALTER TABLE ONLY "public"."inventory_specs"
    ADD CONSTRAINT "inventory_specs_category_id_name_key" UNIQUE ("category_id", "name");



ALTER TABLE ONLY "public"."inventory_specs"
    ADD CONSTRAINT "inventory_specs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_items"
    ADD CONSTRAINT "news_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."news_items"
    ADD CONSTRAINT "news_items_source_url_key" UNIQUE ("source_url");



ALTER TABLE ONLY "public"."page_contents"
    ADD CONSTRAINT "page_contents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_contents"
    ADD CONSTRAINT "page_contents_unique_key" UNIQUE ("page_key", "section_key");



ALTER TABLE ONLY "public"."receipt_no_sequence"
    ADD CONSTRAINT "receipt_no_sequence_pkey" PRIMARY KEY ("date_key");



ALTER TABLE ONLY "public"."refund_no_sequence"
    ADD CONSTRAINT "refund_no_sequence_pkey" PRIMARY KEY ("date_key");



ALTER TABLE ONLY "public"."repair_tickets"
    ADD CONSTRAINT "repair_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_logs"
    ADD CONSTRAINT "ticket_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_materials"
    ADD CONSTRAINT "ticket_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_refunds"
    ADD CONSTRAINT "ticket_refunds_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_customers_name_phone" ON "public"."customers" USING "btree" ("name", "phone");



CREATE INDEX "idx_device_models_brand" ON "public"."device_models" USING "btree" ("brand");



CREATE INDEX "idx_device_models_tag_info" ON "public"."device_models" USING "btree" ("tag_info") WHERE ("tag_info" IS NOT NULL);



CREATE INDEX "idx_inv_categories_name" ON "public"."inventory_categories" USING "btree" ("name");



CREATE INDEX "idx_inv_items_category_id" ON "public"."inventory_items" USING "btree" ("category_id");



CREATE INDEX "idx_inv_items_condition" ON "public"."inventory_items" USING "btree" ("condition");



CREATE INDEX "idx_inv_items_product_id" ON "public"."inventory_items" USING "btree" ("product_id");



CREATE INDEX "idx_inv_items_spec_id" ON "public"."inventory_items" USING "btree" ("spec_id");



CREATE INDEX "idx_inv_products_name" ON "public"."inventory_products" USING "btree" ("name");



CREATE INDEX "idx_inv_products_spec_id" ON "public"."inventory_products" USING "btree" ("spec_id");



CREATE INDEX "idx_inv_specs_category_id" ON "public"."inventory_specs" USING "btree" ("category_id");



CREATE INDEX "idx_inv_specs_name" ON "public"."inventory_specs" USING "btree" ("name");



CREATE INDEX "idx_inv_tx_created_at" ON "public"."inventory_transactions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_inv_tx_item_id" ON "public"."inventory_transactions" USING "btree" ("item_id");



CREATE INDEX "idx_inv_tx_ticket_id" ON "public"."inventory_transactions" USING "btree" ("ticket_id");



CREATE INDEX "idx_inv_tx_type" ON "public"."inventory_transactions" USING "btree" ("transaction_type");



CREATE INDEX "idx_inv_tx_user_id" ON "public"."inventory_transactions" USING "btree" ("user_id");



CREATE INDEX "idx_inventory_condition" ON "public"."inventory" USING "btree" ("condition");



CREATE INDEX "idx_repair_tickets_assignee" ON "public"."repair_tickets" USING "btree" ("assignee_id");



CREATE INDEX "idx_repair_tickets_brand" ON "public"."repair_tickets" USING "btree" ("device_brand");



CREATE INDEX "idx_repair_tickets_customer" ON "public"."repair_tickets" USING "btree" ("customer_id");



CREATE INDEX "idx_repair_tickets_device_type" ON "public"."repair_tickets" USING "btree" ("device_type");



CREATE INDEX "idx_repair_tickets_is_test" ON "public"."repair_tickets" USING "btree" ("is_test");



CREATE UNIQUE INDEX "idx_repair_tickets_receipt_no" ON "public"."repair_tickets" USING "btree" ("receipt_no");



CREATE INDEX "idx_repair_tickets_status" ON "public"."repair_tickets" USING "btree" ("status");



CREATE INDEX "idx_ticket_logs_employee" ON "public"."ticket_logs" USING "btree" ("employee_id");



CREATE INDEX "idx_ticket_logs_ticket" ON "public"."ticket_logs" USING "btree" ("ticket_id");



CREATE INDEX "idx_ticket_materials_item_id" ON "public"."ticket_materials" USING "btree" ("inventory_item_id");



CREATE INDEX "idx_ticket_materials_return_status" ON "public"."ticket_materials" USING "btree" ("return_status") WHERE ("is_return_registered" = true);



CREATE INDEX "idx_ticket_materials_status" ON "public"."ticket_materials" USING "btree" ("request_status");



CREATE INDEX "idx_ticket_materials_ticket_id" ON "public"."ticket_materials" USING "btree" ("ticket_id");



CREATE INDEX "idx_ticket_refunds_completed_at" ON "public"."ticket_refunds" USING "btree" ("completed_at") WHERE ("completed_at" IS NOT NULL);



CREATE UNIQUE INDEX "idx_ticket_refunds_refund_no" ON "public"."ticket_refunds" USING "btree" ("refund_no");



CREATE INDEX "idx_ticket_refunds_status" ON "public"."ticket_refunds" USING "btree" ("status");



CREATE INDEX "idx_ticket_refunds_ticket" ON "public"."ticket_refunds" USING "btree" ("ticket_id");



CREATE INDEX "idx_tickets_assignee" ON "public"."repair_tickets" USING "btree" ("assignee_id");



CREATE INDEX "idx_tickets_canceled_at" ON "public"."repair_tickets" USING "btree" ("canceled_at") WHERE ("canceled_at" IS NOT NULL);



CREATE INDEX "idx_tickets_completed_at" ON "public"."repair_tickets" USING "btree" ("completed_at") WHERE ("completed_at" IS NOT NULL);



CREATE INDEX "idx_tickets_created_at" ON "public"."repair_tickets" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_tickets_disposal" ON "public"."repair_tickets" USING "btree" ("cancel_device_disposal") WHERE ("cancel_device_disposal" IS NOT NULL);



CREATE INDEX "idx_tickets_received_at" ON "public"."repair_tickets" USING "btree" ("received_at") WHERE ("received_at" IS NOT NULL);



CREATE INDEX "idx_tickets_status" ON "public"."repair_tickets" USING "btree" ("status");



CREATE INDEX "news_items_status_date_idx" ON "public"."news_items" USING "btree" ("status", "news_date" DESC);



CREATE INDEX "page_contents_page_key_idx" ON "public"."page_contents" USING "btree" ("page_key");



CREATE OR REPLACE TRIGGER "trg_enforce_minimum_price" BEFORE UPDATE ON "public"."repair_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_minimum_price"();



CREATE OR REPLACE TRIGGER "trg_inventory_items_updated_at" BEFORE UPDATE ON "public"."inventory_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_inventory_items_updated_at"();



CREATE OR REPLACE TRIGGER "trg_news_items_updated_at" BEFORE UPDATE ON "public"."news_items" FOR EACH ROW EXECUTE FUNCTION "public"."news_items_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_page_contents_updated_at" BEFORE UPDATE ON "public"."page_contents" FOR EACH ROW EXECUTE FUNCTION "public"."page_contents_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_protect_approved_ticket" BEFORE UPDATE ON "public"."repair_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."protect_approved_ticket"();



CREATE OR REPLACE TRIGGER "trg_protect_canceled_ticket" BEFORE UPDATE ON "public"."repair_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."protect_canceled_ticket"();



CREATE OR REPLACE TRIGGER "trg_repair_tickets_receipt_no" BEFORE INSERT ON "public"."repair_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."generate_receipt_no"();



CREATE OR REPLACE TRIGGER "trg_repair_tickets_updated_at" BEFORE UPDATE ON "public"."repair_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_refunded_amount" AFTER INSERT OR DELETE OR UPDATE ON "public"."ticket_refunds" FOR EACH ROW EXECUTE FUNCTION "public"."sync_ticket_refunded_amount"();



CREATE OR REPLACE TRIGGER "trg_ticket_materials_updated_at" BEFORE UPDATE ON "public"."ticket_materials" FOR EACH ROW EXECUTE FUNCTION "public"."update_ticket_materials_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ticket_refunds_refund_no" BEFORE INSERT ON "public"."ticket_refunds" FOR EACH ROW EXECUTE FUNCTION "public"."generate_refund_no"();



CREATE OR REPLACE TRIGGER "trg_ticket_refunds_updated_at" BEFORE UPDATE ON "public"."ticket_refunds" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_categories"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."inventory_products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_items"
    ADD CONSTRAINT "inventory_items_spec_id_fkey" FOREIGN KEY ("spec_id") REFERENCES "public"."inventory_specs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_products"
    ADD CONSTRAINT "inventory_products_spec_id_fkey" FOREIGN KEY ("spec_id") REFERENCES "public"."inventory_specs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_specs"
    ADD CONSTRAINT "inventory_specs_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."repair_tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."news_items"
    ADD CONSTRAINT "news_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."page_contents"
    ADD CONSTRAINT "page_contents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."repair_tickets"
    ADD CONSTRAINT "repair_tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "public"."employees"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."repair_tickets"
    ADD CONSTRAINT "repair_tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ticket_logs"
    ADD CONSTRAINT "ticket_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ticket_logs"
    ADD CONSTRAINT "ticket_logs_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."repair_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_materials"
    ADD CONSTRAINT "ticket_materials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."ticket_materials"
    ADD CONSTRAINT "ticket_materials_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ticket_materials"
    ADD CONSTRAINT "ticket_materials_return_category_id_fkey" FOREIGN KEY ("return_category_id") REFERENCES "public"."inventory_categories"("id");



ALTER TABLE ONLY "public"."ticket_materials"
    ADD CONSTRAINT "ticket_materials_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."repair_tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_refunds"
    ADD CONSTRAINT "ticket_refunds_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."employees"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ticket_refunds"
    ADD CONSTRAINT "ticket_refunds_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "public"."employees"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ticket_refunds"
    ADD CONSTRAINT "ticket_refunds_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "public"."employees"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ticket_refunds"
    ADD CONSTRAINT "ticket_refunds_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."employees"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ticket_refunds"
    ADD CONSTRAINT "ticket_refunds_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."repair_tickets"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ticket_refunds"
    ADD CONSTRAINT "ticket_refunds_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "public"."employees"("id") ON DELETE RESTRICT;



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_insert" ON "public"."customers" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role", 'RECEPTION'::"public"."employee_role"])));



CREATE POLICY "customers_select" ON "public"."customers" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "customers_update" ON "public"."customers" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role", 'RECEPTION'::"public"."employee_role"])));



ALTER TABLE "public"."device_models" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "device_models_delete" ON "public"."device_models" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "device_models_insert" ON "public"."device_models" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



CREATE POLICY "device_models_select" ON "public"."device_models" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "device_models_update" ON "public"."device_models" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_delete" ON "public"."employees" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "employees_insert" ON "public"."employees" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "employees_select" ON "public"."employees" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "employees_update" ON "public"."employees" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



ALTER TABLE "public"."global_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "global_settings_select" ON "public"."global_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "global_settings_update" ON "public"."global_settings" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "inv_categories_delete" ON "public"."inventory_categories" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "inv_categories_insert" ON "public"."inventory_categories" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "inv_categories_select" ON "public"."inventory_categories" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "inv_categories_update" ON "public"."inventory_categories" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "inv_items_delete" ON "public"."inventory_items" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



CREATE POLICY "inv_items_insert" ON "public"."inventory_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



CREATE POLICY "inv_items_select" ON "public"."inventory_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "inv_items_update" ON "public"."inventory_items" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



CREATE POLICY "inv_products_delete" ON "public"."inventory_products" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "inv_products_insert" ON "public"."inventory_products" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "inv_products_select" ON "public"."inventory_products" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "inv_products_update" ON "public"."inventory_products" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "inv_specs_delete" ON "public"."inventory_specs" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "inv_specs_insert" ON "public"."inventory_specs" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "inv_specs_select" ON "public"."inventory_specs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "inv_specs_update" ON "public"."inventory_specs" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "inv_tx_insert" ON "public"."inventory_transactions" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



CREATE POLICY "inv_tx_select" ON "public"."inventory_transactions" FOR SELECT TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_delete" ON "public"."inventory" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "inventory_insert" ON "public"."inventory" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



ALTER TABLE "public"."inventory_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_select" ON "public"."inventory" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."inventory_specs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inventory_update" ON "public"."inventory" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



ALTER TABLE "public"."news_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "news_items_delete" ON "public"."news_items" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



CREATE POLICY "news_items_insert" ON "public"."news_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



CREATE POLICY "news_items_select" ON "public"."news_items" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'published'::"text") OR ("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"]))));



CREATE POLICY "news_items_update" ON "public"."news_items" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



ALTER TABLE "public"."page_contents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "page_contents_delete" ON "public"."page_contents" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



CREATE POLICY "page_contents_insert" ON "public"."page_contents" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



CREATE POLICY "page_contents_select" ON "public"."page_contents" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "page_contents_update" ON "public"."page_contents" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"]))) WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



ALTER TABLE "public"."receipt_no_sequence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refund_no_sequence" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."repair_tickets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_logs_delete" ON "public"."ticket_logs" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "ticket_logs_insert" ON "public"."ticket_logs" FOR INSERT TO "authenticated" WITH CHECK (("employee_id" = "auth"."uid"()));



CREATE POLICY "ticket_logs_select" ON "public"."ticket_logs" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ticket_logs_update" ON "public"."ticket_logs" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



ALTER TABLE "public"."ticket_materials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_materials_delete" ON "public"."ticket_materials" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



CREATE POLICY "ticket_materials_insert" ON "public"."ticket_materials" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role", 'TECHNICIAN'::"public"."employee_role"])));



CREATE POLICY "ticket_materials_select" ON "public"."ticket_materials" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ticket_materials_update" ON "public"."ticket_materials" FOR UPDATE TO "authenticated" USING (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role"])));



ALTER TABLE "public"."ticket_refunds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_refunds_select" ON "public"."ticket_refunds" FOR SELECT TO "authenticated" USING (
CASE "public"."get_my_role"()
    WHEN 'ADMIN'::"public"."employee_role" THEN true
    WHEN 'MANAGER'::"public"."employee_role" THEN true
    WHEN 'CS'::"public"."employee_role" THEN true
    WHEN 'RECEPTION'::"public"."employee_role" THEN true
    WHEN 'TECHNICIAN'::"public"."employee_role" THEN (EXISTS ( SELECT 1
       FROM "public"."repair_tickets" "t"
      WHERE (("t"."id" = "ticket_refunds"."ticket_id") AND ("t"."assignee_id" = "auth"."uid"()))))
    WHEN 'EXPERT_REPAIR'::"public"."employee_role" THEN (EXISTS ( SELECT 1
       FROM "public"."repair_tickets" "t"
      WHERE (("t"."id" = "ticket_refunds"."ticket_id") AND ("t"."assignee_id" = "auth"."uid"()))))
    ELSE false
END);



CREATE POLICY "tickets_delete" ON "public"."repair_tickets" FOR DELETE TO "authenticated" USING (("public"."get_my_role"() = 'ADMIN'::"public"."employee_role"));



CREATE POLICY "tickets_insert" ON "public"."repair_tickets" FOR INSERT TO "authenticated" WITH CHECK (("public"."get_my_role"() = ANY (ARRAY['ADMIN'::"public"."employee_role", 'MANAGER'::"public"."employee_role", 'RECEPTION'::"public"."employee_role"])));



CREATE POLICY "tickets_select" ON "public"."repair_tickets" FOR SELECT TO "authenticated" USING (
CASE "public"."get_my_role"()
    WHEN 'ADMIN'::"public"."employee_role" THEN true
    WHEN 'MANAGER'::"public"."employee_role" THEN true
    WHEN 'RECEPTION'::"public"."employee_role" THEN true
    WHEN 'TECHNICIAN'::"public"."employee_role" THEN ("assignee_id" = "auth"."uid"())
    WHEN 'EXPERT_REPAIR'::"public"."employee_role" THEN ("assignee_id" = "auth"."uid"())
    WHEN 'CS'::"public"."employee_role" THEN ("status" = 'COMPLETED'::"public"."ticket_status")
    ELSE false
END);



CREATE POLICY "tickets_update" ON "public"."repair_tickets" FOR UPDATE TO "authenticated" USING (
CASE "public"."get_my_role"()
    WHEN 'ADMIN'::"public"."employee_role" THEN true
    WHEN 'MANAGER'::"public"."employee_role" THEN true
    WHEN 'RECEPTION'::"public"."employee_role" THEN ("status" = 'NEW'::"public"."ticket_status")
    WHEN 'TECHNICIAN'::"public"."employee_role" THEN ("assignee_id" = "auth"."uid"())
    WHEN 'EXPERT_REPAIR'::"public"."employee_role" THEN ("assignee_id" = "auth"."uid"())
    ELSE false
END);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."apply_refund_material_adjustments"("p_refund_id" "uuid", "p_revert" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_refund_material_adjustments"("p_refund_id" "uuid", "p_revert" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_material_dispatch"("p_material_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_material_dispatch"("p_material_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_minimum_price"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_minimum_price"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_minimum_price"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_receipt_no"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_receipt_no"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_receipt_no"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."generate_refund_no"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generate_refund_no"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."news_items_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."news_items_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."news_items_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."page_contents_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."page_contents_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."page_contents_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_approved_ticket"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_approved_ticket"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_approved_ticket"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_canceled_ticket"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_canceled_ticket"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."recalc_ticket_material_cost"("p_ticket_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalc_ticket_material_cost"("p_ticket_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_ticket_material_cost"("p_ticket_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."ticket_refunds" TO "anon";
GRANT ALL ON TABLE "public"."ticket_refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_refunds" TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_refund"("p_ticket_id" "uuid", "p_amount" integer, "p_reason_code" "public"."refund_reason", "p_refund_method" "public"."refund_method", "p_reason_note" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text", "p_material_adjustments" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_refund"("p_ticket_id" "uuid", "p_amount" integer, "p_reason_code" "public"."refund_reason", "p_refund_method" "public"."refund_method", "p_reason_note" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text", "p_material_adjustments" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_refund"("p_ticket_id" "uuid", "p_amount" integer, "p_reason_code" "public"."refund_reason", "p_refund_method" "public"."refund_method", "p_reason_note" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text", "p_material_adjustments" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_ticket_refunded_amount"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_ticket_refunded_amount"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."transition_refund"("p_refund_id" "uuid", "p_action" "text", "p_note" "text", "p_cash_receipt_canceled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transition_refund"("p_refund_id" "uuid", "p_action" "text", "p_note" "text", "p_cash_receipt_canceled" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."transition_refund"("p_refund_id" "uuid", "p_action" "text", "p_note" "text", "p_cash_receipt_canceled" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_inventory_items_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_inventory_items_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_inventory_items_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_ticket_materials_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_ticket_materials_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_ticket_materials_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."device_models" TO "anon";
GRANT ALL ON TABLE "public"."device_models" TO "authenticated";
GRANT ALL ON TABLE "public"."device_models" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."global_settings" TO "anon";
GRANT ALL ON TABLE "public"."global_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."global_settings" TO "service_role";



GRANT ALL ON TABLE "public"."inventory" TO "anon";
GRANT ALL ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_categories" TO "anon";
GRANT ALL ON TABLE "public"."inventory_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_categories" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_items" TO "anon";
GRANT ALL ON TABLE "public"."inventory_items" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_items" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_products" TO "anon";
GRANT ALL ON TABLE "public"."inventory_products" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_products" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_specs" TO "anon";
GRANT ALL ON TABLE "public"."inventory_specs" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_specs" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_transactions" TO "anon";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."news_items" TO "anon";
GRANT ALL ON TABLE "public"."news_items" TO "authenticated";
GRANT ALL ON TABLE "public"."news_items" TO "service_role";



GRANT ALL ON TABLE "public"."page_contents" TO "anon";
GRANT ALL ON TABLE "public"."page_contents" TO "authenticated";
GRANT ALL ON TABLE "public"."page_contents" TO "service_role";



GRANT ALL ON TABLE "public"."receipt_no_sequence" TO "anon";
GRANT ALL ON TABLE "public"."receipt_no_sequence" TO "authenticated";
GRANT ALL ON TABLE "public"."receipt_no_sequence" TO "service_role";



GRANT ALL ON TABLE "public"."refund_no_sequence" TO "anon";
GRANT ALL ON TABLE "public"."refund_no_sequence" TO "authenticated";
GRANT ALL ON TABLE "public"."refund_no_sequence" TO "service_role";



GRANT ALL ON TABLE "public"."repair_tickets" TO "anon";
GRANT ALL ON TABLE "public"."repair_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."repair_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_logs" TO "anon";
GRANT ALL ON TABLE "public"."ticket_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_materials" TO "anon";
GRANT ALL ON TABLE "public"."ticket_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_materials" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

































-- =============================================================
-- 2. Storage (reconstructed from production catalog 2026-09-27)
--    storage.buckets + pg_policies WHERE schemaname = 'storage'.
--    Do NOT "fix" anything here — see known-issues.md KI-7.
-- =============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('ticket-images', 'ticket-images', true, NULL, NULL),
  ('page-content-images', 'page-content-images', true, 10485760,
   ARRAY['image/webp','image/jpeg','image/png','image/gif','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----- ticket-images -----
DROP POLICY IF EXISTS "Allow Public Access zutf89_0" ON storage.objects;
CREATE POLICY "Allow Public Access zutf89_0" ON storage.objects
  AS PERMISSIVE FOR SELECT TO anon
  USING ((bucket_id = 'ticket-images'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text));

DROP POLICY IF EXISTS ticket_images_public_read ON storage.objects;
CREATE POLICY ticket_images_public_read ON storage.objects
  AS PERMISSIVE FOR SELECT TO public
  USING ((bucket_id = 'ticket-images'::text));

DROP POLICY IF EXISTS ticket_images_auth_insert ON storage.objects;
CREATE POLICY ticket_images_auth_insert ON storage.objects
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((bucket_id = 'ticket-images'::text) AND (auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS ticket_images_auth_delete ON storage.objects;
CREATE POLICY ticket_images_auth_delete ON storage.objects
  AS PERMISSIVE FOR DELETE TO public
  USING ((bucket_id = 'ticket-images'::text) AND (auth.role() = 'authenticated'::text));

-- ----- page-content-images -----
DROP POLICY IF EXISTS page_content_images_select ON storage.objects;
CREATE POLICY page_content_images_select ON storage.objects
  AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING ((bucket_id = 'page-content-images'::text));

DROP POLICY IF EXISTS page_content_images_insert ON storage.objects;
CREATE POLICY page_content_images_insert ON storage.objects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((bucket_id = 'page-content-images'::text) AND ((public.get_my_role())::text = ANY (ARRAY['ADMIN'::text, 'MANAGER'::text])));

DROP POLICY IF EXISTS page_content_images_update ON storage.objects;
CREATE POLICY page_content_images_update ON storage.objects
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((bucket_id = 'page-content-images'::text) AND ((public.get_my_role())::text = ANY (ARRAY['ADMIN'::text, 'MANAGER'::text])))
  WITH CHECK ((bucket_id = 'page-content-images'::text) AND ((public.get_my_role())::text = ANY (ARRAY['ADMIN'::text, 'MANAGER'::text])));

DROP POLICY IF EXISTS page_content_images_delete ON storage.objects;
CREATE POLICY page_content_images_delete ON storage.objects
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((bucket_id = 'page-content-images'::text) AND ((public.get_my_role())::text = ANY (ARRAY['ADMIN'::text, 'MANAGER'::text])));


-- =============================================================
-- 3. Function EXECUTE privileges — parity with production
--    pg_dump records ACLs relative to the built-in default (PUBLIC) only.
--    On a fresh Supabase database, ALTER DEFAULT PRIVILEGES (above) also
--    grants EXECUTE to anon/authenticated when each function is created,
--    so the explicit revocations made in production (archived 031, 039,
--    041, 042) must be restated here. Verified against production
--    pg_proc.proacl on 2026-09-27.
-- =============================================================

-- service_role only in production
REVOKE ALL ON FUNCTION "public"."apply_refund_material_adjustments"("p_refund_id" "uuid", "p_revert" boolean) FROM "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."approve_material_dispatch"("p_material_id" "uuid", "p_user_id" "uuid") FROM "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."generate_refund_no"() FROM "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."protect_canceled_ticket"() FROM "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."sync_ticket_refunded_amount"() FROM "anon", "authenticated";

-- authenticated + service_role in production (no anon)
REVOKE ALL ON FUNCTION "public"."recalc_ticket_material_cost"("p_ticket_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."request_refund"("p_ticket_id" "uuid", "p_amount" integer, "p_reason_code" "public"."refund_reason", "p_refund_method" "public"."refund_method", "p_reason_note" "text", "p_refund_bank" "text", "p_refund_account" "text", "p_refund_holder" "text", "p_material_adjustments" "jsonb") FROM "anon";
REVOKE ALL ON FUNCTION "public"."transition_refund"("p_refund_id" "uuid", "p_action" "text", "p_note" "text", "p_cash_receipt_canceled" boolean) FROM "anon";
