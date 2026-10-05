"use client";

import RecordSummaryForm from "./RecordSummaryForm";
import SymptomPicker from "./SymptomPicker";
import MeasurementList from "./MeasurementList";
import FaultList from "./FaultList";
import ActionList from "./ActionList";
import RemovedPartsList from "./RemovedPartsList";
import PartsUsedList from "./PartsUsedList";
import type { PickedModel } from "@/components/catalog/DeviceModelPicker";
import type { PickedBoard } from "@/components/catalog/BoardPicker";
import type { MaterialReturnInfo, RepairRecordData } from "./labels";

interface Props {
  ticketId: string;
  data: RepairRecordData;
  materialReturns: MaterialReturnInfo[];
  categories: { id: string; name: string }[];
  /** 접수건에 연결된 표준 모델/보드 (사용 부품 호환 확인의 대상) */
  ticketModel: PickedModel | null;
  ticketBoard: PickedBoard | null;
}

/** 접수건 상세의 "수리 기록" 섹션 — 수정 권한이 없으면 읽기 전용 */
export default function RepairRecordSection({ ticketId, data, materialReturns, categories, ticketModel, ticketBoard }: Props) {
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

        <PartsUsedList
          ticketId={ticketId}
          partsUsed={data.partsUsed}
          partCompat={data.partCompat}
          ticketModel={ticketModel}
          ticketBoard={ticketBoard}
          canEdit={canEdit}
        />

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
