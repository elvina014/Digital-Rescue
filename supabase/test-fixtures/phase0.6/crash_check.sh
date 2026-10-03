#!/bin/sh
# Phase 0.6 — KI-8 crash check against the LOCAL stack only (never production).
# Before Phase 0.6 every psql case crashes the local Postgres (signal 11); after Phase 0.6 each one is refused with a message.
# Usage (repo root, local stack running): sh supabase/test-fixtures/phase0.6/crash_check.sh after
LABEL="$1"; START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
Z=00000000-0000-0000-0000-000000000000
DB=supabase_db_digital-rescue
wait_db() { for i in $(seq 1 60); do docker exec $DB psql -U postgres -d postgres -Atc "select 1" >/dev/null 2>&1 && return; sleep 1; done; }
psql_case() { # role, sql
  wait_db
  out=$(docker exec $DB psql -U postgres -d postgres -X -At -c "SET ROLE $1" -c "$2" 2>&1 | grep -vE '^SET$' | tr '\n' ' ')
  case "$out" in *"closed the connection"*|*"terminated abnormally"*) r="CRASH";; *) r="$out";; esac
  printf '[%s] psql %-13s %-60s => %s\n' "$LABEL" "$1" "$2" "$r"
  sleep 1
}
psql_case anon          "SELECT public.approve_material_dispatch('$Z','$Z')"
psql_case authenticated "SELECT public.apply_refund_material_adjustments('$Z', false)"
psql_case service_role  "SELECT public.ri_recompute_compatibility('$Z')"
psql_case anon          "SELECT public.recalc_ticket_material_cost('$Z')"
psql_case anon          "SELECT * FROM public.catalog_search_models('lg', 5)"
psql_case authenticated "SELECT public.ri_purchase_resources('$Z')"
wait_db
ENVV=$(npx supabase status -o env 2>/dev/null)
ANON=$(echo "$ENVV" | grep -E '^ANON_KEY=' | cut -d= -f2- | tr -d '"')
SVC=$(echo "$ENVV" | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
API=http://127.0.0.1:54321
rest() { printf '[%s] REST %-13s %-36s => ' "$LABEL" "$1" "$2"; curl -s -w ' HTTP %{http_code}\n' -X POST "$API/rest/v1/rpc/$2" -H "apikey: $ANON" -H "Authorization: Bearer $3" -H "Content-Type: application/json" -d "$4"; }
rest anon approve_material_dispatch "$ANON" "{\"p_material_id\":\"$Z\",\"p_user_id\":\"$Z\"}"
rest anon recalc_ticket_material_cost "$ANON" "{\"p_ticket_id\":\"$Z\"}"
rest service_role ri_compatibility_row "$SVC" "{\"p_part_spec_id\":\"$Z\",\"p_target_type\":\"MODEL\",\"p_target_id\":\"$Z\"}"
sleep 2
echo "[$LABEL] signal 11 in DB log since $START: $(docker logs --since $START $DB 2>&1 | grep -c 'signal 11')"
