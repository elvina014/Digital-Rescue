"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDeviceKnowledgeAction } from "@/app/(admin)/lookup/actions";
import type { DeviceKnowledge, DeviceTarget } from "@/app/(admin)/lookup/actions";
import { RESULT_LABEL } from "@/app/(admin)/tickets/[id]/repair-record/labels";
import CaseList from "./CaseList";
import ModelNoteList from "./ModelNoteList";
import { CASE_STATUS_LABEL } from "./labels";

interface Props {
  target: DeviceTarget;
  excludeTicketId?: string | null;
  canWriteNotes: boolean;
  canOpenDonors: boolean;
  authorName: string;
  /** 접수 폼 안에서는 사례·이력을 줄여서 보여준다 */
  compact?: boolean;
}

/** 기기 지식: 메모, 과거 사례(접수번호만), 사용 부품 이력, 호환 재고 수, 같은 모델 Donor. 오류는 안내만 하고 화면을 막지 않는다 */
export default function DeviceKnowledgePanel({ target, excludeTicketId, canWriteNotes, canOpenDonors, authorName, compact }: Props) {
  const [data, setData] = useState<DeviceKnowledge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${target.modelId}|${target.variantId}|${target.boardId}|${excludeTicketId}`;

  useEffect(() => {
    let cancelled = false;
    getDeviceKnowledgeAction(target, excludeTicketId).then((res) => {
      if (cancelled) return;
      setData(res.data ?? null);
      setError(res.error ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers the ids
  }, [key]);

  if (error) return <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">기기 지식을 불러오지 못했습니다. ({error})</p>;
  if (!data) return <p className="text-sm text-gray-500">기기 지식을 불러오는 중…</p>;

  const c = data.cases;
  const recent = compact ? c.recent.slice(0, 5) : c.recent;
  const summary = [
    ...Object.entries(c.by_status).map(([k, n]) => `${CASE_STATUS_LABEL[k] ?? k} ${n}`),
  ].join(" · ");
  const results = Object.entries(c.by_result).filter(([k]) => k !== "NONE")
    .map(([k, n]) => `${RESULT_LABEL[k] ?? k} ${n}`).join(" · ");

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-700">과거 사례 {c.total}건</span>
        <span className={`rounded-full px-2 py-1 ${data.compatible_in_stock > 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
          호환 부품 재고 {data.compatible_in_stock}종
        </span>
        <span className={`rounded-full px-2 py-1 ${data.donors.length ? "bg-orange-100 text-orange-800" : "bg-gray-100 text-gray-600"}`}>
          같은 기기 Donor {data.donors.length}대
        </span>
        {data.boards.length > 0 && (
          <span className="rounded-full bg-purple-100 px-2 py-1 text-purple-800">보드 {data.boards.map((b) => b.board_number).join(", ")}</span>
        )}
      </div>

      <section>
        <h4 className="mb-1 text-xs font-semibold text-gray-600">메모</h4>
        <ModelNoteList key={key} initial={data.notes} target={target} targetLabel={data.label} canWrite={canWriteNotes} authorName={authorName} />
      </section>

      <section>
        <h4 className="mb-1 text-xs font-semibold text-gray-600">
          과거 수리 사례 {summary && <span className="font-normal text-gray-500">({summary}{results && ` / ${results}`})</span>}
        </h4>
        {recent.length === 0 ? (
          <p className="text-gray-500">{c.total === 0 ? "이 기기로 연결된 과거 접수가 없습니다." : "표시할 사례가 없습니다."}</p>
        ) : (
          <CaseList cases={recent} ticketIds={data.ticket_ids} />
        )}
        {c.skipped > 0 && <p className="mt-1 text-xs text-amber-700">일부 정보({c.skipped}건)를 불러오지 못해 건너뛰었습니다.</p>}
      </section>

      {!compact && data.parts_used.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold text-gray-600">이 기기 수리에 사용된 부품 (이력 — 호환 판정 아님)</h4>
          <ul className="space-y-0.5 text-gray-800">
            {data.parts_used.map((p, i) => (
              <li key={i}>{[p.category, p.spec, p.product, p.capacity].filter(Boolean).join(" / ")} — {p.times}건, {p.quantity}개</li>
            ))}
          </ul>
        </section>
      )}

      {data.donors.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-semibold text-gray-600">같은 기기 Donor (보관 중)</h4>
          <ul className="space-y-0.5">
            {data.donors.map((d) => (
              <li key={d.donor_id}>
                {canOpenDonors ? <Link href={`/donors/${d.donor_id}`} className="text-blue-700 underline">{d.donor_no}</Link> : d.donor_no}
                {d.storage_note && <span className="text-gray-500"> · {d.storage_note}</span>}
                <span className="text-gray-500"> · 적출 가능 후보 {d.candidates}건</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
