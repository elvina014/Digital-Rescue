import { createClient } from "@/utils/supabase/server";
import CatalogTabs from "../CatalogTabs";
import { requireAdminPage } from "../requireAdminPage";
import ModelsClient from "./ModelsClient";
import type { ModelRow } from "./types";

export default async function CatalogModelsPage() {
  await requireAdminPage();
  const supabase = await createClient();

  const [modelsRes, ticketsRes] = await Promise.all([
    supabase
      .from("catalog_models")
      .select(
        `id, name, device_type, release_year, notes, needs_review,
         catalog_brands ( name ),
         catalog_variants ( id, name ),
         catalog_model_aliases ( id, alias, source, variant_id ),
         catalog_model_boards ( id, variant_id, catalog_boards ( id, board_number ) )`
      )
      .order("name"),
    supabase.from("repair_tickets").select("catalog_model_id").not("catalog_model_id", "is", null),
  ]);

  const counts = new Map<string, number>();
  for (const t of ticketsRes.data ?? []) {
    const id = t.catalog_model_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const models: ModelRow[] = (modelsRes.data ?? []).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    brand: (m.catalog_brands as unknown as { name: string } | null)?.name ?? "",
    deviceType: m.device_type as ModelRow["deviceType"],
    releaseYear: m.release_year as number | null,
    notes: m.notes as string | null,
    needsReview: m.needs_review as boolean,
    ticketCount: counts.get(m.id as string) ?? 0,
    variants: (m.catalog_variants ?? []) as ModelRow["variants"],
    aliases: ((m.catalog_model_aliases ?? []) as { id: string; alias: string; source: string; variant_id: string | null }[]).map(
      (a) => ({ id: a.id, alias: a.alias, source: a.source, variantId: a.variant_id })
    ),
    boards: ((m.catalog_model_boards ?? []) as unknown as { id: string; variant_id: string | null; catalog_boards: { id: string; board_number: string } }[]).map(
      (b) => ({ id: b.id, variantId: b.variant_id, boardId: b.catalog_boards.id, boardNumber: b.catalog_boards.board_number })
    ),
  }));
  models.sort((a, b) => a.brand.localeCompare(b.brand, "ko") || a.name.localeCompare(b.name, "ko"));

  return (
    <div className="mx-auto max-w-6xl">
      <CatalogTabs active="/catalog/models" />
      {modelsRes.error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">모델 목록을 불러오지 못했습니다.</p>}
      <ModelsClient models={models} />
    </div>
  );
}
