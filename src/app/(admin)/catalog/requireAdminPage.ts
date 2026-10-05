import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";

/** 기기 마스터 페이지 가드: 비로그인 → /login, ADMIN 외 → /dashboard */
export async function requireAdminPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  if (employee.role !== EmployeeRole.ADMIN) redirect("/dashboard");
  return employee;
}
