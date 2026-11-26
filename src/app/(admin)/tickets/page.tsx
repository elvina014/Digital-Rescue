import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { formatDateTime } from "@/lib/date";
import { TicketStatusBadge } from "@/components/common/TicketStatusBadge";
import { EmployeeRole } from "@/types";
import type { TicketStatus } from "@/types";
import { BRAND_ALIASES, brandGroup, brandKey } from "@/lib/brandAlias";
import TicketFilters from "./TicketFilters";

/**
 * 접수건 목록 페이지
 * repair_tickets + customers + employees(담당기사) 조인하여 테이블 표시
 * RLS 정책에 의해 직급별로 조회 범위가 자동 제한됨
 */
export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");

  const params = await searchParams;
  const statusFilter = typeof params.status === "string" ? params.status : undefined;
  const startDate = typeof params.startDate === "string" ? params.startDate : undefined;
  const endDate = typeof params.endDate === "string" ? params.endDate : undefined;
  const assigneeFilter = typeof params.assignee === "string" ? params.assignee : undefined;
  const searchQuery = typeof params.search === "string" ? params.search.trim() : undefined;
  const brandFilter = typeof params.brand === "string" ? params.brand : undefined;
  const adminMessageFilter = params.has_admin_message === "true";
  // 테스트 접수 필터: undefined/"" = 실접수만, "include" = 전체, "only" = 테스트만
  // ADMIN/MANAGER만 의미가 있음 — 그 외 직급은 항상 실접수만 보임
  const canSeeTest = [EmployeeRole.ADMIN, EmployeeRole.MANAGER].includes(employee.role);
  const testParam = typeof params.test === "string" ? params.test : "";
  const testMode: "hide" | "include" | "only" =
    canSeeTest && testParam === "include" ? "include"
    : canSeeTest && testParam === "only" ? "only"
    : "hide";

  const supabase = await createClient();

  // 담당기사 목록 (필터 드롭다운용)
  const { data: technicians } = await supabase
    .from("employees")
    .select("id, name")
    .in("role", [EmployeeRole.TECHNICIAN, EmployeeRole.EXPERT_REPAIR])
    .order("name");

  // 브랜드 필터 옵션: 원본 표기(삼성/samsung/삼성전자 …)를 그룹으로 묶어 건수 순으로 표시
  const { data: brandRows } = await supabase
    .from("repair_tickets")
    .select("device_brand")
    .not("device_brand", "is", null)
    .neq("device_brand", "");
  const brandRawByGroup = new Map<string, Set<string>>();
  const brandCount = new Map<string, number>();
  for (const r of brandRows ?? []) {
    const raw = r.device_brand as string;
    const group = brandGroup(raw);
    if (!group) continue;
    if (!brandRawByGroup.has(group)) brandRawByGroup.set(group, new Set());
    brandRawByGroup.get(group)!.add(raw);
    brandCount.set(group, (brandCount.get(group) ?? 0) + 1);
  }
  const brandOptions = [...brandCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([group]) => group);

  // 통합 검색: 접수건 본문 외 테이블(메모·조치·고장·진단·증상 메모)에서 일치한 접수건 ID 수집
  // 각 테이블의 RLS가 그대로 적용되고, 최종 목록과 교집합이므로 권한 밖 접수건은 나오지 않는다
  const relatedMatches = new Map<string, Set<string>>(); // ticket_id → 일치 항목 라벨
  if (searchQuery) {
    const pattern = `%${searchQuery.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const sources: { label: string; table: string; column: string }[] = [
      { label: "메모", table: "ticket_logs", column: "message" },
      { label: "조치", table: "repair_actions", column: "description" },
      { label: "고장", table: "repair_faults", column: "component" },
      { label: "고장", table: "repair_faults", column: "description" },
      { label: "진단", table: "repair_records", column: "diagnosis_summary" },
      { label: "진단", table: "repair_records", column: "notes" },
      { label: "증상", table: "ticket_symptoms", column: "note" },
    ];
    const results = await Promise.all(
      sources.map((s) =>
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from(s.table as any)
          .select("ticket_id")
          .ilike(s.column, pattern)
      )
    );
    results.forEach(({ data }, i) => {
      for (const row of (data ?? []) as unknown as { ticket_id: string }[]) {
        if (!relatedMatches.has(row.ticket_id)) relatedMatches.set(row.ticket_id, new Set());
        relatedMatches.get(row.ticket_id)!.add(sources[i].label);
      }
    });
  }

  // repair_tickets에 고객명, 담당기사명을 조인하여 조회
  // 검색어 필터는 조회 후 아래에서 적용한다 (여러 테이블에 걸친 OR 조건이라 SQL 한 번으로 표현하기 어려움)
  let query = supabase
    .from("repair_tickets")
    .select(
      `
      id,
      receipt_no,
      is_test,
      status,
      receipt_type,
      device_brand,
      device_model,
      symptoms,
      tag_info,
      initial_estimate,
      material_cost,
      final_price,
      is_approved,
      payment_status,
      refunded_amount,
      received_at,
      created_at,
      updated_at,
      customers ( name, phone ),
      employees:assignee_id ( name )
    `
    )
    .order("created_at", { ascending: false });

  // 테스트 접수 필터 적용
  if (testMode === "hide") {
    query = query.eq("is_test", false);
  } else if (testMode === "only") {
    query = query.eq("is_test", true);
  }
  // testMode === "include"는 별도 조건 없음 (전체 조회)

  if (brandFilter) {
    const raws = [...(brandRawByGroup.get(brandFilter) ?? [])];
    // 해당 브랜드 접수건이 없으면 빈 결과가 되도록 존재하지 않는 값으로 조회
    query = query.in("device_brand", raws.length > 0 ? raws : ["\u0000"]);
  }

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  // 상태별 날짜 필터 기준 컬럼
  // COMPLETED → completed_at, CANCELED → canceled_at, 나머지 → created_at
  const dateColumn =
    statusFilter === "COMPLETED" ? "completed_at" :
    statusFilter === "CANCELED"  ? "canceled_at"  : "created_at";
  if (startDate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query as any).gte(dateColumn, `${startDate}T00:00:00`);
  }
  if (endDate) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query = (query as any).lte(dateColumn, `${endDate}T23:59:59`);
  }
  if (assigneeFilter) {
    query = query.eq("assignee_id", assigneeFilter);
  }
  if (adminMessageFilter) {
    query = query.eq("has_admin_message", true);
  }

  const { data: allTickets, error } = await query;

  // 검색어 적용: 접수번호·고객·브랜드(별칭 포함)·모델·증상·태그 + 관련 기록 중 하나라도 일치하면 포함
  const matchLabels = new Map<string, string[]>();
  let tickets = allTickets;
  if (searchQuery && allTickets) {
    const term = searchQuery.toLowerCase();
    // 숫자만(하이픈·공백 허용) 3자리 이상이면 하이픈 유무와 무관하게 연락처 비교
    const termDigits = /^[\d\s-]+$/.test(searchQuery) ? searchQuery.replace(/\D/g, "") : "";
    // "삼성"으로 검색하면 samsung·삼성전자 표기도 함께 찾는다
    const termBrand = BRAND_ALIASES[brandKey(searchQuery)];
    const has = (v: unknown) => typeof v === "string" && v.toLowerCase().includes(term);
    tickets = allTickets.filter((t) => {
      const customer = t.customers as unknown as { name: string; phone: string } | null;
      const labels = new Set<string>();
      if (has(t.receipt_no)) labels.add("접수번호");
      if (has(customer?.name)) labels.add("고객명");
      if (has(customer?.phone) ||
          (termDigits.length >= 3 && (customer?.phone ?? "").replace(/\D/g, "").includes(termDigits))) labels.add("연락처");
      if (has(t.device_brand) || (termBrand && brandGroup(t.device_brand) === termBrand)) labels.add("브랜드");
      if (has(t.device_model)) labels.add("모델명");
      if (has(t.symptoms)) labels.add("증상");
      if (has(t.tag_info)) labels.add("태그");
      for (const l of relatedMatches.get(t.id) ?? []) labels.add(l);
      if (labels.size === 0) return false;
      matchLabels.set(t.id, [...labels]);
      return true;
    });
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  return (
    <div>
      {/* 페이지 헤더 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">접수건 목록</h1>
          <p className="mt-1 text-sm text-gray-500">
            총 {tickets?.length ?? 0}건
          </p>
        </div>
        {[EmployeeRole.ADMIN, EmployeeRole.MANAGER, EmployeeRole.RECEPTION].includes(employee.role) && (
          <Link
            href="/tickets/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + 신규 접수
          </Link>
        )}
      </div>

      {/* 필터 */}
      <Suspense fallback={null}>
        <TicketFilters
          technicians={technicians ?? []}
          showAssigneeFilter={![EmployeeRole.TECHNICIAN, EmployeeRole.EXPERT_REPAIR].includes(employee.role)}
          showTestFilter={canSeeTest}
          brandOptions={brandOptions}
        />
      </Suspense>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">접수번호</th>
                <th className="px-4 py-3">고객명</th>
                <th className="px-4 py-3">연락처</th>
                <th className="px-4 py-3">브랜드</th>
                <th className="px-4 py-3">모델명</th>
                <th className="px-4 py-3">증상</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">담당기사</th>
                <th className="px-4 py-3 text-right">자재비</th>
                <th className="px-4 py-3 text-right">최종 견적</th>
                <th className="px-4 py-3">접수일</th>
                <th className="px-4 py-3">최종 수정일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(!tickets || tickets.length === 0) && (
                <tr>
                  <td
                    colSpan={12}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    접수건이 없습니다.
                  </td>
                </tr>
              )}
              {tickets?.map((ticket) => {
                // Supabase 조인 결과 타입 처리
                const customer = ticket.customers as unknown as {
                  name: string;
                  phone: string;
                } | null;
                const assignee = ticket.employees as unknown as {
                  name: string;
                } | null;
                const refundedAmount =
                  ((ticket as Record<string, unknown>).refunded_amount as number) ?? 0;
                const isFullyRefunded =
                  refundedAmount > 0 && refundedAmount >= ticket.final_price;

                return (
                  <tr
                    key={ticket.id}
                    className={`transition-colors hover:bg-gray-50 ${ticket.is_test ? "bg-yellow-50/50" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-700">
                      <Link
                        href={`/tickets/${ticket.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {ticket.receipt_no}
                      </Link>
                      {matchLabels.has(ticket.id) && (
                        <span className="mt-0.5 block font-sans text-[11px] text-amber-700">
                          일치: {matchLabels.get(ticket.id)!.join(" · ")}
                        </span>
                      )}
                      {ticket.is_test && (
                        <span className="ml-1.5 inline-flex items-center rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                          TEST
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                      <Link
                        href={`/tickets/${ticket.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {customer?.name ?? "-"}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {customer?.phone ?? "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {ticket.device_brand}
                    </td>
                    <td className="max-w-[30ch] truncate px-4 py-3 text-gray-600">
                      {ticket.device_model ?? "-"}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-gray-600">
                      {ticket.symptoms}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <TicketStatusBadge
                        status={ticket.status as TicketStatus}
                        receivedAt={ticket.received_at as string | null}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {assignee?.name ?? "미배정"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-600">
                      {ticket.material_cost > 0
                        ? `${ticket.material_cost.toLocaleString()}원`
                        : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-900">
                      {ticket.final_price > 0
                        ? `${ticket.final_price.toLocaleString()}원`
                        : "-"}
                      {refundedAmount > 0 && (
                        <>
                          <span
                            className={`ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              isFullyRefunded
                                ? "bg-rose-100 text-rose-700"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {isFullyRefunded ? "환불" : "부분환불"}
                          </span>
                          <span className="block text-xs text-rose-700">
                            -{refundedAmount.toLocaleString()}원
                          </span>
                        </>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {formatDateTime(ticket.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {formatDateTime(ticket.updated_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
