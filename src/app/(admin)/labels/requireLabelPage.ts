import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { LABEL_MANAGE_ROLES } from "./shared";

/** 라벨 인쇄 화면 가드: 비로그인 → /login, 관리자·팀장 외 → /dashboard */
export async function requireLabelPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  if (!LABEL_MANAGE_ROLES.includes(employee.role)) redirect("/dashboard");
  return employee;
}
