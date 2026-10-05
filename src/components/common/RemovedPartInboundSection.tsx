import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import RemovedPartInboundWidget from "./RemovedPartInboundWidget";

/**
 * 자재 출고 행 없이 등록된 적출 부품의 입고 승인 대기 목록 (관리자/팀장 전용).
 * 기존 "적출/반환 자재 입고 대기" 위젯 바로 아래에 표시한다. 고객 정보는 조회하지 않는다.
 */
export default async function RemovedPartInboundSection() {
  const employee = await getCurrentEmployee();
  if (!employee || (employee.role !== EmployeeRole.ADMIN && employee.role !== EmployeeRole.MANAGER)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("ticket_removed_parts")
    .select(`
      id, ticket_id, description, return_spec, return_name, return_capacity, return_condition, quantity,
      inventory_categories ( name ),
      repair_tickets ( receipt_no, employees:assignee_id ( name ) )
    `)
    .eq("disposition", "STOCK")
    .is("inbound_approved_at", null)
    .order("created_at", { ascending: true });

  const items = (data ?? []).map((r) => {
    const ticket = r.repair_tickets as unknown as { receipt_no: string; employees: { name: string } | null } | null;
    return {
      id: r.id,
      ticket_id: r.ticket_id,
      receipt_no: ticket?.receipt_no ?? "",
      technician_name: ticket?.employees?.name ?? "미배정",
      description: r.description,
      label: [
        (r.inventory_categories as unknown as { name: string } | null)?.name,
        r.return_spec,
        r.return_name,
        r.return_capacity,
      ].filter(Boolean).join(" / "),
      condition: r.return_condition ?? "",
      quantity: r.quantity,
    };
  });

  return <RemovedPartInboundWidget items={items} />;
}
