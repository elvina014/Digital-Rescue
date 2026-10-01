"use client";

import { useState } from "react";
import PartSpecPicker, { type PickedPartSpec } from "@/components/catalog/PartSpecPicker";
import DeviceModelPicker, { type PickedModel } from "@/components/catalog/DeviceModelPicker";
import BoardPicker, { type PickedBoard } from "@/components/catalog/BoardPicker";
import { INSTALL_ANSWER_LABEL } from "@/components/catalog/partLabels";
import { INPUT_CLASS } from "./labels";

export type InstallAnswer = "OK" | "CONDITIONAL" | "INCOMPATIBLE" | "UNKNOWN";

export interface PartResultInput {
  spec: PickedPartSpec | null;
  answer: InstallAnswer;
  limitationNote: string;
  targetType: "MODEL" | "VARIANT" | "BOARD" | null;
  targetId: string | null;
}

interface Props {
  initialSpec: PickedPartSpec | null;
  initialAnswer: InstallAnswer;
  initialNote: string;
  /** 접수건에 연결된 표준 모델/보드 — 있으면 그것이 호환 대상이다 */
  ticketModel: PickedModel | null;
  ticketBoard: PickedBoard | null;
  pending: boolean;
  onSubmit: (input: PartResultInput) => void;
  onCancel: () => void;
}

/** 사용 부품 한 줄의 호환 확인 입력: 부품 규격 → 대상 → 정상동작/조건부/비호환/판단불가 */
export default function PartResultForm({ initialSpec, initialAnswer, initialNote, ticketModel, ticketBoard, pending, onSubmit, onCancel }: Props) {
  const [spec, setSpec] = useState(initialSpec);
  const [answer, setAnswer] = useState<InstallAnswer>(initialAnswer);
  const [note, setNote] = useState(initialNote);
  const [model, setModel] = useState<PickedModel | null>(null);
  const [board, setBoard] = useState<PickedBoard | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const needsBoard = spec?.compatTarget === "BOARD";
  const fixedTarget = needsBoard ? ticketBoard?.label : ticketModel?.label;

  function submit() {
    if (answer === "UNKNOWN") {
      return onSubmit({ spec, answer, limitationNote: "", targetType: null, targetId: null });
    }
    if (!spec) return setWarning("부품 규격을 선택해 주세요.");
    if (answer === "CONDITIONAL" && !note.trim()) return setWarning("조건부는 제한사항을 입력해 주세요. (예: 밝기 조절 불가)");
    let targetType: PartResultInput["targetType"] = null;
    let targetId: string | null = null;
    if (!fixedTarget) {
      if (needsBoard) {
        if (!board) return setWarning("호환을 확인한 메인보드를 선택해 주세요.");
        targetType = "BOARD";
        targetId = board.boardId;
      } else {
        if (!model) return setWarning("호환을 확인한 표준 모델을 선택해 주세요.");
        targetType = model.variantId ? "VARIANT" : "MODEL";
        targetId = model.variantId ?? model.modelId;
      }
    }
    setWarning(null);
    onSubmit({ spec, answer, limitationNote: note, targetType, targetId });
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-teal-200 bg-teal-50/50 p-2">
      <div className="flex flex-wrap gap-1">
        {(Object.keys(INSTALL_ANSWER_LABEL) as InstallAnswer[]).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAnswer(a)}
            className={`rounded-lg border px-3 py-1 text-xs ${answer === a ? "border-teal-600 bg-teal-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"}`}
          >
            {INSTALL_ANSWER_LABEL[a]}
          </button>
        ))}
      </div>
      {answer === "UNKNOWN" ? (
        <p className="text-xs text-gray-500">판단불가는 호환성 근거로 저장되지 않습니다.</p>
      ) : (
        <>
          <PartSpecPicker value={spec} onChange={setSpec} />
          {spec &&
            (fixedTarget ? (
              <p className="text-xs text-gray-600">호환 대상: <span className="font-medium">{fixedTarget}</span> (접수건에 연결된 {needsBoard ? "보드" : "표준 모델"})</p>
            ) : needsBoard ? (
              <BoardPicker value={board} onChange={setBoard} />
            ) : (
              <DeviceModelPicker value={model} onChange={setModel} />
            ))}
          {answer === "CONDITIONAL" && (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="제한사항 (예: 밝기 조절 불가, 브래킷 가공 필요)"
              maxLength={200}
              className={`w-full ${INPUT_CLASS}`}
            />
          )}
        </>
      )}
      {warning && <p className="text-xs text-red-600">{warning}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={pending} className="rounded-lg bg-teal-600 px-3 py-1 text-xs text-white hover:bg-teal-700 disabled:opacity-50">
          저장
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">
          취소
        </button>
      </div>
    </div>
  );
}
