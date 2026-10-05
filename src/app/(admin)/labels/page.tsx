import { createClient } from "@/utils/supabase/server";
import { DONOR_STATUS_LABEL } from "@/app/(admin)/donors/labels";
import { requireLabelPage } from "./requireLabelPage";
import { ITEM_CONDITION_LABEL } from "./shared";
import LabelPicker, { type PickRow } from "./LabelPicker";

const RECENT_DAYS = 7;

function sinceIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** 라벨 인쇄 (Phase 7) — 관리자·팀장. 외주 항목은 실물이 아니므로 목록에서 제외 (Q5) */
export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireLabelPage();
  const params = await searchParams;
  const tab = params.tab === "donors" ? "donors" : "items";
  const recent = params.recent === "1";
  const since = sinceIso(RECENT_DAYS);
  const supabase = await createClient();

  let rows: PickRow[] = [];
  if (tab === "items") {
    let q = supabase
      .from("inventory_items")
      .select(`id, label_code, capacity, condition, quantity, created_at,
               inventory_categories ( name ), inventory_specs ( name ), inventory_products ( name ), storage_locations ( code )`)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (recent) q = q.gte("created_at", since);
    const { data } = await q;
    rows = (data ?? [])
      .filter((i) => one(i.inventory_specs as Rel<{ name: string }>)?.name !== "외주")
      .map((i) => ({
        code: i.label_code,
        title: [
          one(i.inventory_categories as Rel<{ name: string }>)?.name,
          one(i.inventory_specs as Rel<{ name: string }>)?.name,
          one(i.inventory_products as Rel<{ name: string }>)?.name,
          i.capacity,
        ].filter(Boolean).join(" / "),
        sub: `${ITEM_CONDITION_LABEL[i.condition] ?? i.condition} · 수량 ${i.quantity}`,
        location: one(i.storage_locations as Rel<{ code: string }>)?.code ?? null,
        createdDate: new Date(i.created_at).toLocaleDateString("ko-KR"),
      }));
  } else {
    let q = supabase
      .from("donor_devices")
      .select("id, donor_no, brand, model_text, status, created_at, storage_locations ( code )")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (recent) q = q.gte("created_at", since);
    const { data } = await q;
    rows = (data ?? []).map((d) => ({
      code: d.donor_no,
      title: [d.brand, d.model_text].filter(Boolean).join(" "),
      sub: DONOR_STATUS_LABEL[d.status] ?? d.status,
      location: one(d.storage_locations as Rel<{ code: string }>)?.code ?? null,
      createdDate: new Date(d.created_at).toLocaleDateString("ko-KR"),
    }));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">라벨 인쇄</h1>
        <p className="mt-1 text-sm text-gray-500">
          신품 재고는 품목(행)당 1장, 적출 부품은 1개 단위로 1장, Donor 기기는 기기당 1장입니다. 라벨 크기 50 × 30 mm.
        </p>
      </div>
      <LabelPicker key={`${tab}-${recent}`} tab={tab} recent={recent} rows={rows} />
    </div>
  );
}
