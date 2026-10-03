import { createClient } from "@/utils/supabase/server";
import { requireAdminPage } from "@/app/(admin)/catalog/requireAdminPage";
import LocationsClient, { type LocationRow } from "./LocationsClient";

/** 보관 위치 관리 (Phase 7) — 관리자 전용. 위치 지정은 라벨 조회 화면에서 관리자·팀장이 한다 */
export default async function LocationsPage() {
  await requireAdminPage();
  const supabase = await createClient();
  const [{ data: locations }, { data: items }, { data: donors }] = await Promise.all([
    supabase.from("storage_locations").select("id, code, description, is_active").order("code"),
    supabase.from("inventory_items").select("storage_location_id").not("storage_location_id", "is", null),
    supabase.from("donor_devices").select("storage_location_id").not("storage_location_id", "is", null),
  ]);

  const usage = new Map<string, number>();
  for (const r of [...(items ?? []), ...(donors ?? [])]) {
    if (r.storage_location_id) usage.set(r.storage_location_id, (usage.get(r.storage_location_id) ?? 0) + 1);
  }
  const rows: LocationRow[] = (locations ?? []).map((l) => ({ ...l, usage: usage.get(l.id) ?? 0 }));

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">보관 위치 관리</h1>
        <p className="mt-1 text-sm text-gray-500">
          코드가 위치 구조를 나타냅니다 (예: A-01-04 = 구역 A · 랙 01 · 칸 04, DONOR-C07). 코드는 등록 후 바꿀 수 없고, 삭제 대신 사용 중지합니다.
        </p>
      </div>
      <LocationsClient initial={rows} />
    </div>
  );
}
