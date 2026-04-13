import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import NewTicketForm from "./NewTicketForm";

const CAN_CREATE_TICKET: EmployeeRole[] = [
  EmployeeRole.ADMIN,
  EmployeeRole.MANAGER,
  EmployeeRole.RECEPTION,
];

/**
 * 신규 접수 등록 페이지
 * ADMIN, MANAGER, RECEPTION 직급만 접근 가능
 */
export default async function NewTicketPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");

  // 접수 권한이 없는 직급은 목록으로 리다이렉트
  if (!CAN_CREATE_TICKET.includes(employee.role)) {
    redirect("/tickets");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">신규 접수 등록</h1>
        <p className="mt-1 text-sm text-gray-500">
          고객 정보와 고장 증상을 입력하여 새 접수건을 생성합니다.
        </p>
      </div>
      <NewTicketForm />
    </div>
  );
}
