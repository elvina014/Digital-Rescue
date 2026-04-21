import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { getPendingMaterialRequests, getCancelRequestedMaterials, getPendingReturnMaterials } from "@/app/(admin)/tickets/actions";
import { getInventoryTransactions } from "@/app/actions/inventoryActions";
import InventoryClient from "./InventoryClient";
import MaterialDispatchWidget from "@/components/common/MaterialDispatchWidget";
import MaterialReturnWidget from "@/components/common/MaterialReturnWidget";
import ReturnMaterialInboundWidget from "@/components/common/ReturnMaterialInboundWidget";

const CAN_ACCESS: EmployeeRole[] = [EmployeeRole.ADMIN, EmployeeRole.MANAGER];

export default async function InventoryPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  if (!CAN_ACCESS.includes(employee.role)) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: items }, materialRequests, returnRequests, inboundReturnRequests, transactionsRes] = await Promise.all([
    supabase
      .from("inventory_items")
      .select(
        `
      *,
      inventory_categories(name),
      inventory_specs(name),
      inventory_products(name)
    `
      )
      .order("updated_at", { ascending: false }),
    getPendingMaterialRequests(),
    getCancelRequestedMaterials(),
    getPendingReturnMaterials(),
    getInventoryTransactions(200),
  ]);

  const materialWidgetData = (materialRequests.data ?? []).map((r: Record<string, unknown>) => {
    const inv = r.inventory_items as Record<string, unknown> | null;
    const ticket = r.repair_tickets as Record<string, unknown> | null;
    const customer = ticket?.customers as Record<string, unknown> | null;
    return {
      id: r.id as string,
      ticket_id: r.ticket_id as string,
      quantity: r.quantity as number,
      created_at: r.created_at as string,
      category_name: (inv?.inventory_categories as Record<string, string> | null)?.name ?? "",
      spec_name: (inv?.inventory_specs as Record<string, string> | null)?.name ?? "",
      product_name: (inv?.inventory_products as Record<string, string> | null)?.name ?? "",
      capacity: (inv?.capacity as string | null) ?? null,
      base_estimate: (inv?.base_estimate as number) ?? 0,
      customer_name: (customer?.name as string) ?? "고객",
      device_info: [ticket?.device_brand, ticket?.device_model].filter(Boolean).join(" "),
      technician_name: ((ticket?.employees as Record<string, string> | null)?.name) ?? "미배정",
      request_type: (r.request_type as string) ?? "dispatch",
    };
  });

  const returnWidgetData = (returnRequests.data ?? []).map((r: Record<string, unknown>) => {
    const inv = r.inventory_items as Record<string, unknown> | null;
    const ticket = r.repair_tickets as Record<string, unknown> | null;
    const customer = ticket?.customers as Record<string, unknown> | null;
    return {
      id: r.id as string,
      ticket_id: r.ticket_id as string,
      quantity: r.quantity as number,
      created_at: r.created_at as string,
      category_name: (inv?.inventory_categories as Record<string, string> | null)?.name ?? "",
      spec_name: (inv?.inventory_specs as Record<string, string> | null)?.name ?? "",
      product_name: (inv?.inventory_products as Record<string, string> | null)?.name ?? "",
      capacity: (inv?.capacity as string | null) ?? null,
      base_estimate: (inv?.base_estimate as number) ?? 0,
      customer_name: (customer?.name as string) ?? "고객",
      device_info: [ticket?.device_brand, ticket?.device_model].filter(Boolean).join(" "),
      technician_name: ((ticket?.employees as Record<string, string> | null)?.name) ?? "미배정",
      request_type: (r.request_type as string) ?? "dispatch",
    };
  });

  const inboundReturnWidgetData = (inboundReturnRequests.data ?? []).map((r: Record<string, unknown>) => {
    const inv = r.inventory_items as Record<string, unknown> | null;
    const ticket = r.repair_tickets as Record<string, unknown> | null;
    const catName = (inv?.inventory_categories as Record<string, string> | null)?.name ?? "";
    const specName = (inv?.inventory_specs as Record<string, string> | null)?.name ?? "";
    const prodName = (inv?.inventory_products as Record<string, string> | null)?.name ?? "";
    return {
      id: r.id as string,
      ticket_id: r.ticket_id as string,
      original_label: [catName, specName, prodName].filter(Boolean).join(" / "),
      return_category: catName,
      return_spec: (r.return_spec as string) ?? "",
      return_name: (r.return_name as string) ?? "",
      return_condition: (r.return_condition as string) ?? "",
      technician_name: ((ticket?.employees as Record<string, string> | null)?.name) ?? "미배정",
    };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <MaterialDispatchWidget requests={materialWidgetData} />
      <MaterialReturnWidget requests={returnWidgetData} />
      <ReturnMaterialInboundWidget items={inboundReturnWidgetData} />
      <InventoryClient
        items={items ?? []}
        transactions={transactionsRes.data ?? []}
        currentEmployee={{ id: employee.id, name: employee.name, role: employee.role }}
      />
    </div>
  );
}
