"use client";

import RecordSummaryForm from "./RecordSummaryForm";
import SymptomPicker from "./SymptomPicker";
import MeasurementList from "./MeasurementList";
import FaultList from "./FaultList";
import ActionList from "./ActionList";
import RemovedPartsList from "./RemovedPartsList";
import type { MaterialReturnInfo, RepairRecordData } from "./labels";

interface Props {
  ticketId: string;
  data: RepairRecordData;
  materialReturns: MaterialReturnInfo[];
  categories: { id: string; name: string }[];
}

/** 접수건 상세의 "수리 기록" 섹션 — 수정 권한이 없으면 읽기 전용 */
export default function RepairRecordSection({ ticketId, data, materialReturns, categories }: Props) {
  const { canEdit } = data;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-base font-semibold text-gray-800">수리 기록</h2>
        {!canEdit && <span className="text-xs text-gray-400">읽기 전용</span>}
      </div>
      <div className="space-y-5">
        <SymptomPicker ticketId={ticketId} symptoms={data.symptoms} codes={data.symptomCodes} canEdit={canEdit} />
        <MeasurementList ticketId={ticketId} measurements={data.measurements} canEdit={canEdit} />
        <FaultList ticketId={ticketId} faults={data.faults} canEdit={canEdit} />
        <ActionList ticketId={ticketId} actions={data.actions} canEdit={canEdit} />

        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-gray-800">
            사용 부품 <span className="text-xs font-normal text-gray-400">· 출고·구매 승인 내역에서 자동 표시</span>
          </h3>
          {data.partsUsed.length === 0 ? (
            <p className="text-xs text-gray-400">승인된 자재가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-gray-50 text-sm">
              {data.partsUsed.map((p) => (
                <li key={p.material_id} className="px-3 py-2 text-gray-700">
                  {[p.category_name, p.spec_name, p.product_name, p.capacity].filter(Boolean).join(" / ")} × {p.quantity}개
                  {p.request_type === "purchase" && <span className="ml-2 text-xs text-amber-600">구매</span>}
                  {p.is_outsourced && <span className="ml-2 text-xs text-gray-400">외주</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <RemovedPartsList
          ticketId={ticketId}
          removedParts={data.removedParts}
          materialReturns={materialReturns}
          categories={categories}
          canEdit={canEdit}
        />

        <div className="border-t border-gray-100 pt-4">
          <RecordSummaryForm ticketId={ticketId} record={data.record} canEdit={canEdit} />
        </div>
      </div>
    </section>
  );
}
