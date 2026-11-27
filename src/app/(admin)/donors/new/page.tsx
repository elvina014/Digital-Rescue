import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { requireDonorPage } from "../requireDonorPage";
import { DONOR_EDIT_ROLES } from "../labels";
import StoreDonorForm from "./StoreDonorForm";

/** 매장 보관 기기 → Donor 등록 (접수 없음, 관리자·팀장) — Phase 4.1 */
export default async function NewStoreDonorPage() {
  const employee = await requireDonorPage();
  if (!DONOR_EDIT_ROLES.includes(employee.role)) redirect("/donors");

  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("storage_locations")
    .select("id, code, description")
    .eq("is_active", true)
    .order("code");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/donors" className="text-sm text-blue-700 hover:underline">← Donor 기기 목록</Link>
      <h1 className="mt-2 text-xl font-bold text-gray-900">매장 보관 기기 등록</h1>
      <p className="mt-1 text-sm text-gray-500">
        접수 기록이 없는 매장 보관 기기(부품용 매입, 출처 불명 장기 보관 등)를 회사 자산 Donor로 등록합니다.
        고객이 맡긴 기기는 여기서 등록하지 말고, 접수건의 폐기 확인에서 &quot;Donor로 전환&quot;을 사용하세요.
      </p>
      <StoreDonorForm locations={locations ?? []} />
    </div>
  );
}
