import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { getCategories, getSpecs, getProducts, getGlobalSettings } from "@/app/actions/inventoryActions";
import InventorySettingsClient from "./InventorySettingsClient";

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

  return (
    <div className="mx-auto max-w-7xl">
      <InventorySettingsClient
        initialCategories={categoriesRes.data ?? []}
        initialSpecs={specsRes.data ?? []}
        initialProducts={productsRes.data ?? []}
        initialGlobalSettings={"data" in settingsRes ? settingsRes.data ?? null : null}
      />
    </div>
  );
}
