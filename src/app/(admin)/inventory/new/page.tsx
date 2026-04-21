import { redirect } from "next/navigation";
import { getCurrentEmployee } from "@/lib/auth";
import { EmployeeRole } from "@/types";
import { getCategories, getSpecs, getProducts } from "@/app/actions/inventoryActions";
import NewInventoryForm from "./NewInventoryForm";

const CAN_ACCESS: EmployeeRole[] = [EmployeeRole.ADMIN, EmployeeRole.MANAGER];

export default async function NewInventoryPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect("/login");
  if (!CAN_ACCESS.includes(employee.role)) redirect("/dashboard");

  const [categoriesRes, specsRes, productsRes] = await Promise.all([
    getCategories(),
    getSpecs(),
    getProducts(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">신규 재고 등록</h1>
        <a
          href="/inventory"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          ← 목록으로
        </a>
      </div>
      <NewInventoryForm
        categories={categoriesRes.data ?? []}
        specs={specsRes.data ?? []}
        products={productsRes.data ?? []}
      />
    </div>
  );
}
