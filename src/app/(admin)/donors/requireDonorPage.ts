import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { DONOR_STAFF_ROLES } from "./labels";

/** Donor 기기 화면 가드: 비로그인 → /login, 관리자·팀장·기사·정밀수리팀 외 → /dashboard */
export async function requireDonorPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  if (!DONOR_STAFF_ROLES.includes(employee.role)) redirect("/dashboard");
  return employee;
}
