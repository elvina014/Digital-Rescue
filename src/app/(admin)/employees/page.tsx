import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { EmployeeListClient } from "./EmployeeListClient";

/**
 * 직원 관리 페이지 — ADMIN 전용
 */
export default async function EmployeesPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  if (employee.role !== EmployeeRole.ADMIN) redirect("/dashboard");

  const supabase = await createClient();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, name, role, phone, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        직원 데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  return <EmployeeListClient employees={employees ?? []} />;
}
