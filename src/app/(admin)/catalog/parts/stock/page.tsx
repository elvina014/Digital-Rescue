import { createClient } from "@/utils/supabase/server";
import { PART_TYPE_LABEL } from "@/components/catalog/partLabels";
import CatalogTabs from "../../CatalogTabs";
import { requireAdminPage } from "../../requireAdminPage";
import StockLinkClient from "./StockLinkClient";
import type { StockRow } from "./StockLinkClient";

export default async function CatalogPartStockPage() {
  await requireAdminPage();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("inventory_items")
    .select(
      `id, capacity, condition, quantity,
       inventory_categories ( name ), inventory_specs ( name ), inventory_products ( name ),
       part_specs ( id, part_type, name, compat_target )`
    )
    .order("created_at");

  type Named = { name: string } | null;
  const items: StockRow[] = (data ?? [])
    .map((i) => {
      const spec = i.part_specs as unknown as { id: string; part_type: string; name: string; compat_target: string } | null;
      return {
        id: i.id,
        category: (i.inventory_categories as unknown as Named)?.name ?? "",
        spec: (i.inventory_specs as unknown as Named)?.name ?? "",
        product: (i.inventory_products as unknown as Named)?.name ?? "",
        capacity: i.capacity,
        condition: i.condition,
        quantity: i.quantity,
        partSpec: spec
          ? {
              partSpecId: spec.id,
              label: `${PART_TYPE_LABEL[spec.part_type] ?? spec.part_type} · ${spec.name}`,
              compatTarget: spec.compat_target === "BOARD" ? ("BOARD" as const) : ("MODEL" as const),
            }
          : null,
      };
    })
    // 외주 항목은 부품이 아니라 서비스 — 호환성 대상에서 제외 (Q5)
    .filter((i) => i.spec !== "외주");

  return (
    <div className="mx-auto max-w-6xl">
      <CatalogTabs active="/catalog/parts/stock" />
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">재고 목록을 불러오지 못했습니다.</p>}
      <StockLinkClient items={items} />
    </div>
  );
}
