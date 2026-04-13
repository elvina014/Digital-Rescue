import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { TicketStatusBadge } from "@/components/common/TicketStatusBadge";
import type { TicketStatus } from "@/types";

/**
 * 접수건 목록 페이지
 * repair_tickets + customers + employees(담당기사) 조인하여 테이블 표시
 * RLS 정책에 의해 직급별로 조회 범위가 자동 제한됨
 */
export default async function TicketsPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");

  const supabase = await createClient();

  // repair_tickets에 고객명, 담당기사명을 조인하여 조회
  const { data: tickets, error } = await supabase
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
      final_price,
      is_approved,
      payment_status,
      created_at,
      customers ( name, phone ),
      employees:assignee_id ( name )
    `
    )
    .order("created_at", { ascending: false });

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
      </div>

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
                <th className="px-4 py-3 text-right">최종 견적</th>
                <th className="px-4 py-3">접수일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(!tickets || tickets.length === 0) && (
                <tr>
                  <td
                    colSpan={9}
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
                      {customer?.name ?? "-"}
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
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-900">
                      {ticket.final_price > 0
                        ? `${ticket.final_price.toLocaleString()}원`
                        : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                      {new Date(ticket.created_at).toLocaleDateString("ko-KR")}
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
