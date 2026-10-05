import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { toUuidOrNull } from "@/lib/catalogErrors";
import { PART_TYPE_LABEL } from "@/components/catalog/partLabels";
import { requireDonorPage } from "../requireDonorPage";
import { DONOR_EDIT_ROLES, type CandidateRow } from "../labels";
import DonorInfoForm from "./DonorInfoForm";
import DonorPhotos from "./DonorPhotos";
import CandidateList from "./CandidateList";

export default async function DonorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const employee = await requireDonorPage();
  const { id } = await params;
  if (!toUuidOrNull(id)) notFound();
  const supabase = await createClient();

  const { data: donor } = await supabase
    .from("donor_devices")
    .select(`*, catalog_models ( name, catalog_brands ( name ) ), catalog_variants ( name ), catalog_boards ( board_number ), storage_locations ( code ),
             consent:employees!donor_devices_consent_confirmed_by_fkey ( name )`)
    .eq("id", id)
    .maybeSingle();
  if (!donor) notFound();

  const [candidatesRes, photosRes, categoriesRes, ticketRes] = await Promise.all([
    supabase
      .from("donor_part_candidates")
      .select("*, part_specs ( part_type, name ), inventory_categories ( name )")
      .eq("donor_id", id)
      .order("created_at"),
    supabase.from("donor_photos").select("id, path, description, created_at").eq("donor_id", id).order("created_at"),
    supabase.from("inventory_categories").select("id, name").order("name"),
    // 기사는 배정된 접수건만 조회 가능 (tickets_select) — 보이지 않으면 번호를 표시하지 않는다
    supabase.from("repair_tickets").select("receipt_no").eq("id", donor.source_ticket_id).maybeSingle(),
  ]);

  const photos = photosRes.data ?? [];
  const signed = photos.length
    ? (await supabase.storage.from("donor-photos").createSignedUrls(photos.map((p) => p.path), 3600)).data ?? []
    : [];
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));

  const candidates: CandidateRow[] = (candidatesRes.data ?? []).map((c) => {
    const spec = c.part_specs as unknown as { part_type: string; name: string } | null;
    return {
      id: c.id, description: c.description, quantity: c.quantity, condition_estimate: c.condition_estimate, status: c.status, note: c.note,
      part_spec_id: c.part_spec_id, partSpecLabel: spec ? `${PART_TYPE_LABEL[spec.part_type] ?? spec.part_type} · ${spec.name}` : null,
      category_id: c.category_id, categoryName: (c.inventory_categories as unknown as { name: string } | null)?.name ?? null,
      return_spec: c.return_spec, return_name: c.return_name, return_capacity: c.return_capacity,
      extracted_at: c.extracted_at, inventory_item_id: c.inventory_item_id,
    };
  });

  const model = donor.catalog_models as unknown as { name: string; catalog_brands: { name: string } | null } | null;
  const variant = donor.catalog_variants as unknown as { name: string } | null;
  const board = donor.catalog_boards as unknown as { board_number: string } | null;
  const canEdit = DONOR_EDIT_ROLES.includes(employee.role);
  const location = (donor.storage_locations as unknown as { code: string } | null)?.code ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/donors" className="text-sm text-blue-700 hover:underline">← Donor 기기 목록</Link>
        <h1 className="mt-2 text-xl font-bold text-gray-900">
          <span className="font-mono">{donor.donor_no}</span> · {[donor.brand, donor.model_text].filter(Boolean).join(" ")}
        </h1>
        <p className="mt-1 text-xs text-gray-500">
          소유권 포기 동의 확인: {(donor.consent as unknown as { name: string } | null)?.name ?? "-"} ·{" "}
          {new Date(donor.consent_confirmed_at).toLocaleString("ko-KR")}
          {ticketRes.data && (
            <>
              {" "}· 원 접수건{" "}
              <Link href={`/tickets/${donor.source_ticket_id}`} className="font-mono text-blue-700 hover:underline">{ticketRes.data.receipt_no}</Link>
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          라벨 <Link href={`/scan/${donor.donor_no}`} className="font-mono text-blue-700 hover:underline">{donor.donor_no}</Link>
          {" "}· 보관 위치 <span className="font-mono">{location ?? "미지정"}</span>
          {canEdit && (
            <>
              {" "}· <Link href={`/labels/print?c=${donor.donor_no}`} className="text-blue-700 hover:underline">라벨 인쇄</Link>
            </>
          )}
        </p>
      </div>

      <DonorInfoForm
        canEdit={canEdit}
        donor={{
          id: donor.id, brand: donor.brand, modelText: donor.model_text ?? "", tagInfo: donor.tag_info ?? "", status: donor.status,
          conditionNote: donor.condition_note ?? "", storageNote: donor.storage_note ?? "", deviceType: donor.device_type,
          model: model && donor.catalog_model_id
            ? { modelId: donor.catalog_model_id, variantId: donor.catalog_variant_id,
                label: [model.catalog_brands?.name, model.name, variant?.name].filter(Boolean).join(" ") }
            : null,
          board: board && donor.catalog_board_id ? { boardId: donor.catalog_board_id, label: board.board_number } : null,
        }}
      />

      <DonorPhotos
        donorId={donor.id}
        canDelete={canEdit}
        photos={photos.map((p) => ({ id: p.id, url: urlByPath.get(p.path) ?? null, description: p.description }))}
      />

      <CandidateList
        donorId={donor.id}
        donorAvailable={donor.status === "AVAILABLE"}
        canBook={canEdit}
        candidates={candidates}
        categories={categoriesRes.data ?? []}
      />
    </div>
  );
}
