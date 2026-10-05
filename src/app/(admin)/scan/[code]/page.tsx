import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { DONOR_STAFF_ROLES } from "@/app/(admin)/donors/labels";
import { LABEL_MANAGE_ROLES, normalizeLabelCode } from "@/app/(admin)/labels/shared";
import ScanForm from "../ScanForm";
import ScanItemView from "./ScanItemView";
import ScanDonorView from "./ScanDonorView";
import type { LookupResult } from "./types";

/** 라벨 스캔 결과 (Phase 7) — 로그인 필수, 모든 직원. QR은 이 경로를 가리킨다 */
export default async function ScanResultPage({ params }: { params: Promise<{ code: string }> }) {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");

  const { code: raw } = await params;
  const code = normalizeLabelCode(raw);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("label_lookup", { p_code: code });
  const result: LookupResult = error ? { error: "조회에 실패했습니다: " + error.message } : (data as unknown as LookupResult);

  const canManage = LABEL_MANAGE_ROLES.includes(employee.role);
  const { data: locations } = canManage
    ? await supabase.from("storage_locations").select("id, code, description").eq("is_active", true).order("code")
    : { data: [] };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/scan" className="text-sm text-blue-700 hover:underline">← 라벨 조회</Link>
        <ScanForm />
      </div>

      {"error" in result ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          <span className="font-mono font-semibold">{code || "-"}</span> — {result.error}
        </div>
      ) : result.kind === "ITEM" ? (
        <ScanItemView item={result.item} history={result.history} canManage={canManage} locations={locations ?? []} />
      ) : (
        <ScanDonorView
          donor={result.donor}
          candidates={result.candidates}
          canManage={canManage}
          canOpenDonor={DONOR_STAFF_ROLES.includes(employee.role)}
          locations={locations ?? []}
        />
      )}
    </div>
  );
}
