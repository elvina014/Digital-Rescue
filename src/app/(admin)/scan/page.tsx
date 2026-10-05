import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import ScanForm from "./ScanForm";

/** 라벨 조회 (Phase 7) — 모든 직원 */
export default async function ScanPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold text-gray-900">라벨 조회</h1>
      <p className="text-sm text-gray-500">
        라벨의 QR을 휴대폰 카메라로 찍거나, 코드를 입력(또는 USB 스캐너로 스캔)하세요.
      </p>
      <ScanForm />
    </div>
  );
}
