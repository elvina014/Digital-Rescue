import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { DONOR_STAFF_ROLES } from "../donors/labels";
import { NOTE_WRITER_ROLES } from "@/components/knowledge/labels";
import LookupClient from "./LookupClient";

/** 부품·기기 검색 — 전 직원 (결정 5). 메모 작성은 관리자·팀장·기사·정밀수리팀 */
export default async function LookupPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-bold text-gray-900">부품·기기 검색</h1>
      <p className="mt-1 text-sm text-gray-500">
        모델·보드로 맞는 부품을 찾거나, 품번·칩 마킹으로 맞는 기기를 찾습니다. 우선순위: 과거 수리 사례 → 검증됨 → 재고 → Donor → 문서 근거 → 추정.
      </p>
      <LookupClient
        canWriteNotes={NOTE_WRITER_ROLES.includes(employee.role)}
        canOpenDonors={DONOR_STAFF_ROLES.includes(employee.role)}
        authorName={employee.name}
      />
    </div>
  );
}
