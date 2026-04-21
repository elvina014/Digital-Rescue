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
    const capacity = (inv?.capacity as string | null) ?? null;
    return {
      id: r.id as string,
      ticket_id: r.ticket_id as string,
      original_label: [catName, specName, prodName, capacity].filter(Boolean).join(" / "),
      return_category: catName,
      return_spec: (r.return_spec as string) ?? "",
      return_name: (r.return_name as string) ?? "",
      return_condition: (r.return_condition as string) ?? "",
      return_quantity: (r.return_quantity as number | null) ?? 1,
      return_capacity: (r.return_capacity as string | null) ?? null,
      technician_name: ((ticket?.employees as Record<string, string> | null)?.name) ?? "미배정",
    };
  });

  // Supabase JOIN 결과가 배열로 추론되므로 단일 객체로 변환
  const transactionRows = (transactionsRes.data ?? []).map((t: Record<string, unknown>) => {
    const emp = t.employees as { name: string }[] | { name: string } | null;
    const inv = t.inventory_items as {
      capacity: string | null;
      inventory_categories: { name: string }[] | { name: string } | null;
      inventory_specs: { name: string }[] | { name: string } | null;
      inventory_products: { name: string }[] | { name: string } | null;
    }[] | {
      capacity: string | null;
      inventory_categories: { name: string }[] | { name: string } | null;
      inventory_specs: { name: string }[] | { name: string } | null;
      inventory_products: { name: string }[] | { name: string } | null;
    } | null;

    const empObj = Array.isArray(emp) ? emp[0] ?? null : emp;
    const invObj = Array.isArray(inv) ? inv[0] ?? null : inv;

    const cats = invObj?.inventory_categories;
    const specs = invObj?.inventory_specs;
    const prods = invObj?.inventory_products;

    return {
      id: t.id as string,
      transaction_type: t.transaction_type as string,
      quantity_changed: t.quantity_changed as number,
      notes: (t.notes as string | null) ?? null,
      ticket_id: (t.ticket_id as string | null) ?? null,
      created_at: t.created_at as string,
      employees: empObj ? { name: empObj.name } : null,
      inventory_items: invObj
        ? {
            capacity: invObj.capacity,
            inventory_categories: Array.isArray(cats) ? cats[0] ?? null : cats ?? null,
            inventory_specs: Array.isArray(specs) ? specs[0] ?? null : specs ?? null,
            inventory_products: Array.isArray(prods) ? prods[0] ?? null : prods ?? null,
          }
        : null,
    };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <MaterialDispatchWidget requests={materialWidgetData} />
      <MaterialReturnWidget requests={returnWidgetData} />
      <ReturnMaterialInboundWidget items={inboundReturnWidgetData} />
      <InventoryClient
        items={items ?? []}
        transactions={transactionRows}
        currentEmployee={{ id: employee.id, name: employee.name, role: employee.role }}
      />
    </div>
  );
}
