"use client";

import { useState } from "react";
import Link from "next/link";
import { CANDIDATE_STATUS_LABEL, CONDITION_LABEL, DONOR_STATUS_LABEL } from "./labels";

export interface DonorListRow {
  id: string;
  donorNo: string;
  device: string;
  catalogLabel: string | null;
  status: string;
  storageNote: string | null;
  createdAt: string;
  available: number;
  extracted: number;
}

export interface PotentialRow {
  candidateId: string;
  donorId: string;
  donorNo: string;
  description: string;
  quantity: number;
  condition: string;
  status: string;
  partLabel: string | null;
  device: string;
  board: string | null;
  storageNote: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: "bg-green-100 text-green-800",
  DEPLETED: "bg-gray-100 text-gray-600",
  SCRAPPED: "bg-red-100 text-red-700",
};

const includes = (q: string, ...values: (string | null)[]) => values.some((v) => v?.toLowerCase().includes(q));

/** Donor 목록 / 적출 가능 부품(잠재 재고) 탭 + 텍스트 필터 */
export default function DonorsClient({ donors, parts }: { donors: DonorListRow[]; parts: PotentialRow[] }) {
  const [tab, setTab] = useState<"donors" | "parts">("donors");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("AVAILABLE");
  const q = query.trim().toLowerCase();

  const shownDonors = donors.filter(
    (d) => (!status || d.status === status) && (!q || includes(q, d.donorNo, d.device, d.catalogLabel, d.storageNote))
  );
  const shownParts = parts.filter((p) => !q || includes(q, p.description, p.partLabel, p.device, p.board, p.donorNo));

  const tabCls = (active: boolean) =>
    `-mb-px border-b-2 px-4 py-2 text-sm font-medium ${active ? "border-blue-600 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`;

  return (
    <div className="mt-4">
      <nav className="flex gap-1 border-b border-gray-200">
        <button type="button" className={tabCls(tab === "donors")} onClick={() => setTab("donors")}>
          Donor 기기 ({donors.length})
        </button>
        <button type="button" className={tabCls(tab === "parts")} onClick={() => setTab("parts")}>
          적출 가능 부품 ({parts.length})
        </button>
      </nav>

      <div className="my-4 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === "donors" ? "번호·모델·보관 위치 검색" : "부품·규격·모델·보드 검색"}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        {tab === "donors" && (
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" aria-label="상태">
            <option value="">전체 상태</option>
            {Object.entries(DONOR_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        )}
      </div>

      {tab === "donors" ? (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white text-sm">
          {shownDonors.length === 0 && <li className="p-4 text-gray-500">해당하는 Donor 기기가 없습니다.</li>}
          {shownDonors.map((d) => (
            <li key={d.id}>
              <Link href={`/donors/${d.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <span className="font-mono font-semibold text-gray-900">{d.donorNo}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[d.status] ?? ""}`}>{DONOR_STATUS_LABEL[d.status] ?? d.status}</span>
                <span className="text-gray-800">{d.device}</span>
                {d.catalogLabel && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800">{d.catalogLabel}</span>}
                <span className="ml-auto text-xs text-gray-500">
                  적출 가능 {d.available}건 · 입고 완료 {d.extracted}건{d.storageNote ? ` · ${d.storageNote}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white text-sm">
          {shownParts.length === 0 && <li className="p-4 text-gray-500">적출 가능한 부품이 없습니다.</li>}
          {shownParts.map((p) => (
            <li key={p.candidateId}>
              <Link href={`/donors/${p.donorId}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <span className="text-gray-900">{p.description}</span>
                {p.quantity > 1 && <span className="text-xs text-gray-500">× {p.quantity}</span>}
                {p.partLabel && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-900">{p.partLabel}</span>}
                <span className="text-xs text-gray-500">{CONDITION_LABEL[p.condition] ?? p.condition}</span>
                {p.status === "REQUESTED" && <span className="text-xs text-indigo-700">{CANDIDATE_STATUS_LABEL.REQUESTED}</span>}
                <span className="ml-auto text-xs text-gray-500">
                  <span className="font-mono">{p.donorNo}</span> · {p.device}
                  {p.board ? ` · ${p.board}` : ""}
                  {p.storageNote ? ` · ${p.storageNote}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
