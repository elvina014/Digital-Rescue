import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { qrSvg } from "@/lib/qr";
import { requireLabelPage } from "../requireLabelPage";
import { ITEM_CONDITION_LABEL, MAX_PRINT_LABELS, normalizeLabelCode } from "../shared";
import LabelSheet, { LABEL_HEIGHT_MM, LABEL_WIDTH_MM, type PrintLabel } from "./LabelSheet";
import PrintButton from "./PrintButton";

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** 라벨 인쇄 미리보기 (?c=P-00012,D-0003) — QR은 이 서버(login.)의 /scan/<코드>를 가리킨다 */
export default async function LabelPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireLabelPage();
  const raw = (await searchParams).c;
  const codes = [...new Set((typeof raw === "string" ? raw : "").split(",").map(normalizeLabelCode).filter(Boolean))].slice(0, MAX_PRINT_LABELS);
  const itemCodes = codes.filter((c) => c.startsWith("P-"));
  const donorCodes = codes.filter((c) => c.startsWith("D-"));

  const supabase = await createClient();
  const [itemsRes, donorsRes] = await Promise.all([
    itemCodes.length
      ? supabase
          .from("inventory_items")
          .select(`label_code, capacity, condition, inventory_categories ( name ), inventory_specs ( name ), inventory_products ( name ), storage_locations ( code )`)
          .in("label_code", itemCodes)
      : Promise.resolve({ data: [] as never[] }),
    donorCodes.length
      ? supabase.from("donor_devices").select("donor_no, brand, model_text, device_type, storage_locations ( code )").in("donor_no", donorCodes)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (/localhost|127\.0\.0\.1/.test(host) ? "http" : "https");
  const scanUrl = (code: string) => `${proto}://${host}/scan/${code}`;

  const byCode = new Map<string, Omit<PrintLabel, "qrSvg">>();
  for (const i of itemsRes.data ?? []) {
    byCode.set(i.label_code, {
      code: i.label_code,
      line: [
        one(i.inventory_specs as Rel<{ name: string }>)?.name,
        one(i.inventory_products as Rel<{ name: string }>)?.name,
        i.capacity,
      ].filter(Boolean).join(" "),
      sub: `${one(i.inventory_categories as Rel<{ name: string }>)?.name ?? ""} · ${ITEM_CONDITION_LABEL[i.condition] ?? i.condition}`,
      location: one(i.storage_locations as Rel<{ code: string }>)?.code ?? null,
    });
  }
  for (const d of donorsRes.data ?? []) {
    byCode.set(d.donor_no, {
      code: d.donor_no,
      line: [d.brand, d.model_text].filter(Boolean).join(" "),
      sub: `Donor · ${d.device_type}`,
      location: one(d.storage_locations as Rel<{ code: string }>)?.code ?? null,
    });
  }

  const found = codes.filter((c) => byCode.has(c));
  const missing = codes.filter((c) => !byCode.has(c));
  const labels: PrintLabel[] = await Promise.all(found.map(async (c) => ({ ...byCode.get(c)!, qrSvg: await qrSvg(scanUrl(c)) })));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/labels" className="text-sm text-blue-700 hover:underline">← 라벨 인쇄</Link>
          <h1 className="mt-1 text-xl font-bold text-gray-900">라벨 {labels.length}장</h1>
          <p className="text-xs text-gray-500">
            {LABEL_WIDTH_MM} × {LABEL_HEIGHT_MM} mm, 1장 = 1페이지. 인쇄 창에서 여백 &apos;없음&apos;, 배율 100%로 설정하세요.
          </p>
        </div>
        {labels.length > 0 && <PrintButton />}
      </div>
      {missing.length > 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">찾을 수 없는 라벨: {missing.join(", ")}</p>
      )}
      {labels.length === 0 ? (
        <p className="text-sm text-gray-500">인쇄할 라벨이 없습니다. 라벨 인쇄 화면에서 항목을 선택해 주세요.</p>
      ) : (
        <LabelSheet labels={labels} />
      )}
    </div>
  );
}
