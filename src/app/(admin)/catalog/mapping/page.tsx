import { createClient } from "@/utils/supabase/server";
import { getUnmappedModelStringsAction } from "../actions";
import CatalogTabs from "../CatalogTabs";
import { requireAdminPage } from "../requireAdminPage";
import MappingClient from "./MappingClient";
import type { RecentMapping } from "./RecentMappings";

export default async function CatalogMappingPage() {
  await requireAdminPage();
  const supabase = await createClient();

  const [unmapped, aliasesRes, logRes] = await Promise.all([
    getUnmappedModelStringsAction(),
    supabase
      .from("catalog_model_aliases")
      .select("id, alias, created_at, catalog_models ( name, catalog_brands ( name ) ), catalog_variants ( name )")
      .eq("source", "mapping")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("catalog_ticket_link_log").select("alias_id, action"),
  ]);

  // 별칭별 현재 연결 수 = link − unlink
  const linkCount = new Map<string, number>();
  for (const row of logRes.data ?? []) {
    if (!row.alias_id) continue;
    linkCount.set(row.alias_id, (linkCount.get(row.alias_id) ?? 0) + (row.action === "link" ? 1 : -1));
  }

  const recent: RecentMapping[] = (aliasesRes.data ?? []).map((a) => {
    const m = a.catalog_models as unknown as { name: string; catalog_brands: { name: string } | null } | null;
    const v = a.catalog_variants as unknown as { name: string } | null;
    return {
      aliasId: a.id as string,
      alias: a.alias as string,
      createdAt: a.created_at as string,
      modelLabel: [m?.catalog_brands?.name, m?.name, v?.name].filter(Boolean).join(" · "),
      linked: linkCount.get(a.id as string) ?? 0,
    };
  });

  return (
    <div className="mx-auto max-w-6xl">
      <CatalogTabs active="/catalog/mapping" />
      {unmapped.error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{unmapped.error}</p>}
      <MappingClient initialGroups={unmapped.data} initialRecent={recent} />
    </div>
  );
}
