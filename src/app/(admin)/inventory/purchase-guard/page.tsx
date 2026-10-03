import { createClient } from "@/utils/supabase/server";
import { requireAdminPage } from "@/app/(admin)/catalog/requireAdminPage";
import { REASON_CODES, REASON_LABELS } from "@/components/purchase-guard/labels";
import PurchaseGuardReport, { type GuardLogRow } from "./PurchaseGuardReport";

const PERIODS = [7, 30, 90, 365] as const;

function sinceIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** 구매 사유 보고서 (Phase 6) — 관리자 전용. purchase_guard_logs 는 RLS로 ADMIN만 조회된다 */
export default async function PurchaseGuardReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdminPage();
  const params = await searchParams;
  const daysParam = Number(params.days);
  const days = (PERIODS as readonly number[]).includes(daysParam) ? daysParam : 30;
  const reason = typeof params.reason === "string" && (REASON_CODES as readonly string[]).includes(params.reason)
    ? params.reason
    : params.reason === "NONE" ? "NONE" : "";

  const since = sinceIso(days);
  const supabase = await createClient();
  let query = supabase
    .from("purchase_guard_logs")
    .select(`
      id, ticket_id, item_label, quantity, resource_count, resources, reason_code, reason_note, created_at,
      repair_tickets ( receipt_no ),
      ticket_materials ( request_status ),
      employees ( name )
    `)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (reason === "NONE") query = query.is("reason_code", null);
  else if (reason) query = query.eq("reason_code", reason);
  const { data, error } = await query;

  const rows: GuardLogRow[] = (data ?? []).map((r) => ({
    id: r.id,
    ticketId: r.ticket_id,
    receiptNo: (r.repair_tickets as unknown as { receipt_no: string | null } | null)?.receipt_no ?? null,
    itemLabel: r.item_label,
    quantity: r.quantity,
    resourceCount: r.resource_count,
    resources: (r.resources ?? []) as unknown as GuardLogRow["resources"],
    reasonCode: r.reason_code,
    reasonNote: r.reason_note,
    createdAt: r.created_at,
    materialStatus: (r.ticket_materials as unknown as { request_status: string } | null)?.request_status ?? null,
    requester: (r.employees as unknown as { name: string } | null)?.name ?? null,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">구매 사유 보고서</h1>
        <p className="mt-1 text-sm text-gray-500">
          구매 요청 시 확인된 내부 자원(재고·Donor)과 구매 사유입니다. 재고 설정에서 &lsquo;구매 요청 시 내부 자원 확인&rsquo;이 켜져 있을 때만 기록됩니다.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <label className="text-sm text-gray-700">
          기간
          <select name="days" defaultValue={String(days)} className="ml-2 rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            {PERIODS.map((d) => <option key={d} value={d}>최근 {d}일</option>)}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          사유
          <select name="reason" defaultValue={reason} className="ml-2 rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">전체</option>
            <option value="NONE">사유 없음 (내부 자원 없음)</option>
            {REASON_CODES.map((c) => <option key={c} value={c}>{REASON_LABELS[c]}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">조회</button>
      </form>

      {error ? (
        <p className="text-sm text-red-600">보고서를 불러오지 못했습니다: {error.message}</p>
      ) : (
        <PurchaseGuardReport rows={rows} />
      )}
    </div>
  );
}

