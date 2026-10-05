import Link from "next/link";
import { CANDIDATE_STATUS_LABEL, CONDITION_LABEL, DONOR_STATUS_LABEL } from "@/app/(admin)/donors/labels";
import LocationSelect, { type LocationOption } from "../LocationSelect";
import type { LookupCandidate, LookupDonor } from "./types";

/** 스캔 결과 — Donor 기기 (기기당 라벨 1장 = donor_no) */
export default function ScanDonorView({
  donor,
  candidates,
  canManage,
  canOpenDonor,
  locations,
}: {
  donor: LookupDonor;
  candidates: LookupCandidate[];
  canManage: boolean;
  canOpenDonor: boolean;
  locations: LocationOption[];
}) {
  const device = [donor.brand, donor.model_text].filter(Boolean).join(" ");

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-xs text-gray-500">Donor 기기 라벨</p>
        <h2 className="mt-1 font-mono text-2xl font-bold">{donor.donor_no}</h2>
        <p className="mt-2 text-base font-medium text-gray-900">{device}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <dt className="text-gray-500">상태</dt>
          <dd>{DONOR_STATUS_LABEL[donor.status] ?? donor.status}</dd>
          <dt className="text-gray-500">기기 종류</dt>
          <dd>{donor.device_type}</dd>
          <dt className="text-gray-500">표준 모델</dt>
          <dd>{donor.catalog_model_label ?? "-"}</dd>
          <dt className="text-gray-500">보드</dt>
          <dd className="font-mono">{donor.board_number ?? "-"}</dd>
          <dt className="text-gray-500">원 접수번호</dt>
          <dd className="font-mono">
            {canManage ? (
              <Link href={`/tickets/${donor.source_ticket_id}`} className="text-blue-700 hover:underline">{donor.source_receipt_no}</Link>
            ) : (
              donor.source_receipt_no
            )}
          </dd>
          <dt className="text-gray-500">보관 메모</dt>
          <dd>{donor.storage_note ?? "-"}</dd>
        </dl>
        <div className="mt-4 border-t pt-3">
          {canManage ? (
            <LocationSelect kind="DONOR" targetId={donor.id} current={donor.location} options={locations} />
          ) : (
            <p className="text-sm">
              보관 위치: <span className="font-mono font-semibold">{donor.location ?? "미지정"}</span>
            </p>
          )}
        </div>
        <div className="mt-3 flex gap-3 text-sm">
          {canOpenDonor && <Link href={`/donors/${donor.id}`} className="text-blue-700 hover:underline">Donor 상세</Link>}
          {canManage && <Link href={`/labels/print?c=${donor.donor_no}`} className="text-blue-700 hover:underline">라벨 다시 인쇄</Link>}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 font-semibold text-gray-900">부품 후보 · 적출 이력</h3>
        {candidates.length === 0 ? (
          <p className="text-sm text-gray-400">등록된 부품 후보가 없습니다.</p>
        ) : (
          <ul className="divide-y text-sm">
            {candidates.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {c.description} × {c.quantity}
                  {c.part_spec && <span className="ml-2 text-xs text-gray-500">{c.part_spec}</span>}
                  <span className="ml-2 text-xs text-gray-500">({CONDITION_LABEL[c.condition_estimate] ?? c.condition_estimate})</span>
                </span>
                <span className="text-xs text-gray-600">
                  {CANDIDATE_STATUS_LABEL[c.status] ?? c.status}
                  {c.extracted_at && ` · ${new Date(c.extracted_at).toLocaleDateString("ko-KR")}`}
                  {c.item_label_code && (
                    <Link href={`/scan/${c.item_label_code}`} className="ml-2 font-mono text-blue-700 hover:underline">{c.item_label_code}</Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
