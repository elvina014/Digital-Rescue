import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { EmployeeRole } from "@/types";
import { EmployeeListClient } from "./EmployeeListClient";

/**
 * 직원 관리 페이지 — ADMIN 전용
 */
export default async function EmployeesPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  if (employee.role !== EmployeeRole.ADMIN) redirect("/dashboard");

  const adminSupa = createAdminClient();

  // 직원 프로필 목록 조회
  const { data: employees, error } = await adminSupa
    .from("employees")
    .select("id, name, role, phone, is_assignable, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        직원 데이터를 불러오는 중 오류가 발생했습니다: {error.message}
      </div>
    );
  }

  // Supabase Auth admin API로 이메일 목록 조회
  const { data: usersData } = await adminSupa.auth.admin.listUsers({
    perPage: 1000,
  });
  const emailMap = new Map<string, string>(
    (usersData?.users ?? []).map((u) => [u.id, u.email ?? ""])
  );

  // 이메일 합치기
  const employeesWithEmail = (employees ?? []).map((emp) => ({
    ...emp,
    email: emailMap.get(emp.id) ?? "",
  }));

  return <EmployeeListClient employees={employeesWithEmail} />;
}
