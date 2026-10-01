import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { getCategories, getSpecs, getProducts, getGlobalSettings } from "@/app/actions/inventoryActions";
import InventorySettingsClient from "./InventorySettingsClient";
import RepairGateSettingsCard from "./RepairGateSettingsCard";
import { createClient } from "@/utils/supabase/server";

const CAN_ACCESS: EmployeeRole[] = [EmployeeRole.ADMIN];

export default async function InventorySettingsPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  if (!CAN_ACCESS.includes(employee.role)) redirect("/dashboard");

  const [categoriesRes, specsRes, productsRes, settingsRes] = await Promise.all([
    getCategories(),
    getSpecs(),
    getProducts(),
    getGlobalSettings(),
  ]);

  // 수리 기록 필수 확인(게이트) 설정 — 기본 OFF
  const supabase = await createClient();
  const { data: gateFlags } = await supabase
    .from("global_settings")
    .select("ri_approval_gate_enabled, ri_cancel_gate_enabled")
    .eq("id", true)
    .single();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <InventorySettingsClient
        initialCategories={categoriesRes.data ?? []}
        initialSpecs={specsRes.data ?? []}
        initialProducts={productsRes.data ?? []}
        initialGlobalSettings={"data" in settingsRes ? settingsRes.data ?? null : null}
      />
      <RepairGateSettingsCard
        approvalEnabled={gateFlags?.ri_approval_gate_enabled ?? false}
        cancelEnabled={gateFlags?.ri_cancel_gate_enabled ?? false}
      />
    </div>
  );
}
