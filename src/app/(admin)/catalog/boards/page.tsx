import { createClient } from "@/utils/supabase/server";
import CatalogTabs from "../CatalogTabs";
import { requireAdminPage } from "../requireAdminPage";
import BoardsClient from "./BoardsClient";
import type { BoardRow } from "./BoardsClient";

export default async function CatalogBoardsPage() {
  await requireAdminPage();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("catalog_boards")
    .select(
      `id, board_number, manufacturer, notes,
       catalog_board_aliases ( id, alias ),
       catalog_model_boards ( id, catalog_models ( name, catalog_brands ( name ) ), catalog_variants ( name ) )`
    )
    .order("board_number");

  const boards: BoardRow[] = (data ?? []).map((b) => ({
    id: b.id as string,
    boardNumber: b.board_number as string,
    manufacturer: b.manufacturer as string | null,
    notes: b.notes as string | null,
    aliases: (b.catalog_board_aliases ?? []) as { id: string; alias: string }[],
    models: ((b.catalog_model_boards ?? []) as unknown as {
      id: string;
      catalog_models: { name: string; catalog_brands: { name: string } | null } | null;
      catalog_variants: { name: string } | null;
    }[]).map((l) => ({
      id: l.id,
      label: [l.catalog_models?.catalog_brands?.name, l.catalog_models?.name, l.catalog_variants?.name].filter(Boolean).join(" · "),
    })),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <CatalogTabs active="/catalog/boards" />
      {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">보드 목록을 불러오지 못했습니다.</p>}
      <BoardsClient boards={boards} />
    </div>
  );
}
