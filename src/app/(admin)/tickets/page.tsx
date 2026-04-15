import { redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { TicketStatusBadge } from "@/components/common/TicketStatusBadge";
import { EmployeeRole } from "@/types";
import type { TicketStatus } from "@/types";
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

  const supabase = await createClient();

  // 담당기사 목록 (필터 드롭다운용)
  const { data: technicians } = await supabase
    .from("employees")
    .select("id, name")
    .in("role", [EmployeeRole.TECHNICIAN, EmployeeRole.EXPERT_REPAIR])
    .order("name");

  // repair_tickets에 고객명, 담당기사명을 조인하여 조회
  // 검색어가 있으면 customers!inner 조인으로 부모행 필터링
  const customerJoin = searchQuery
    ? "customers!inner ( name, phone )"
    : "customers ( name, phone )";

  let query = supabase
    .from("repair_tickets")
    .select(
      `
      id,
      status,
      receipt_type,
      device_brand,
      device_model,
      symptoms,
      initial_estimate,
      material_cost,
      final_price,
      is_approved,
      payment_status,
      created_at,
      updated_at,
      ${customerJoin},
      employees:assignee_id ( name )
    `
    )
    .order("created_at", { ascending: false });

  if (searchQuery) {
    const safeTerm = searchQuery.replace(/,/g, "");
    query = query.or(
      `name.ilike.%${safeTerm}%,phone.ilike.%${safeTerm}%`,
      { referencedTable: "customers" }
    );
  }

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }
  if (startDate) {
    query = query.gte("created_at", `${startDate}T00:00:00`);
  }
  if (endDate) {
    query = query.lte("created_at", `${endDate}T23:59:59`);
  }
  if (assigneeFilter) {
    query = query.eq("assignee_id", assigneeFilter);
  }

  const { data: tickets, error } = await query;

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
        <TicketFilters technicians={technicians ?? []} />
      </Suspense>

      {/* 테이블 */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500">
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
                    colSpan={11}
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

                return (
                  <tr
                    key={ticket.id}
                    className="transition-colors hover:bg-gray-50"
                  >
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
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {ticket.device_model ?? "-"}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-gray-600">
                      {ticket.symptoms}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <TicketStatusBadge
                        status={ticket.status as TicketStatus}
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
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(ticket.created_at))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(ticket.updated_at))}
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
