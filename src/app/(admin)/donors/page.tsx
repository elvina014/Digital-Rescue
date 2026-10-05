import { createClient } from "@/utils/supabase/server";
import { PART_TYPE_LABEL } from "@/components/catalog/partLabels";
import { requireDonorPage } from "./requireDonorPage";
import DonorsClient, { type DonorListRow, type PotentialRow } from "./DonorsClient";

export default async function DonorsPage() {
  await requireDonorPage();
  const supabase = await createClient();

  const [donorsRes, stockRes] = await Promise.all([
    supabase
      .from("donor_devices")
      .select(`id, donor_no, device_type, brand, model_text, status, storage_note, created_at,
               catalog_models ( name, catalog_brands ( name ) ),
               donor_part_candidates ( status )`)
      .order("created_at", { ascending: false }),
    supabase.from("donor_potential_stock").select("*").order("created_at", { ascending: false }),
  ]);

  const donors: DonorListRow[] = (donorsRes.data ?? []).map((d) => {
    const model = d.catalog_models as unknown as { name: string; catalog_brands: { name: string } | null } | null;
    const statuses = (d.donor_part_candidates ?? []).map((c) => c.status);
    return {
      id: d.id,
      donorNo: d.donor_no,
      device: [d.brand, d.model_text].filter(Boolean).join(" "),
      catalogLabel: model ? [model.catalog_brands?.name, model.name].filter(Boolean).join(" ") : null,
      status: d.status,
      storageNote: d.storage_note,
      createdAt: d.created_at,
      available: statuses.filter((s) => s === "AVAILABLE" || s === "REQUESTED").length,
      extracted: statuses.filter((s) => s === "EXTRACTED").length,
    };
  });

  const parts: PotentialRow[] = (stockRes.data ?? []).map((p) => ({
    candidateId: p.candidate_id ?? "",
    donorId: p.donor_id ?? "",
    donorNo: p.donor_no ?? "",
    description: p.description ?? "",
    quantity: p.quantity ?? 1,
    condition: p.condition_estimate ?? "UNTESTED",
    status: p.candidate_status ?? "AVAILABLE",
    partLabel: p.part_name ? `${PART_TYPE_LABEL[p.part_type ?? ""] ?? p.part_type} · ${p.part_name}` : null,
    device: p.catalog_model_label ?? [p.brand, p.model_text].filter(Boolean).join(" "),
    board: p.board_number,
    storageNote: p.storage_note,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-xl font-bold text-gray-900">Donor 기기</h1>
      <p className="mt-1 text-sm text-gray-500">
        고객이 소유권을 포기한 기기를 부품 공급원으로 보관합니다. 부품은 필요할 때 떼어내 적출 입고하면 일반 재고가 됩니다.
      </p>
      {(donorsRes.error || stockRes.error) && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">목록을 불러오지 못했습니다.</p>
      )}
      <DonorsClient donors={donors} parts={parts} />
    </div>
  );
}
