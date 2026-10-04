"use client";

import { useEffect, useState } from "react";
import PartSpecPicker from "@/components/catalog/PartSpecPicker";
import type { PickedPartSpec } from "@/components/catalog/PartSpecPicker";
import BoardPicker from "@/components/catalog/BoardPicker";
import type { PickedBoard } from "@/components/catalog/BoardPicker";
import DeviceModelPicker from "@/components/catalog/DeviceModelPicker";
import type { PickedModel } from "@/components/catalog/DeviceModelPicker";
import { recognizePhotoAction } from "./actions";
import { PHOTO_KIND_LABEL } from "./labels";
import type { PhotoKind, RecognitionResult as Result } from "./labels";
import RecognitionResult from "./RecognitionResult";

const KINDS: PhotoKind[] = ["PART", "BOARD", "DEVICE"];
const TARGET_HINT: Record<PhotoKind, string> = {
  PART: "어떤 부품의 사진인가요? (부품 규격)",
  BOARD: "어떤 메인보드의 사진인가요?",
  DEVICE: "어떤 모델의 기기 라벨인가요?",
};

/** 사진 종류 → 대상 선택 → 사진 → 인식 요청. 오류가 나도 입력은 그대로 둔다. */
export default function PhotoRecognizeForm() {
  const [kind, setKind] = useState<PhotoKind>("PART");
  const [part, setPart] = useState<PickedPartSpec | null>(null);
  const [board, setBoard] = useState<PickedBoard | null>(null);
  const [model, setModel] = useState<PickedModel | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const target =
    kind === "PART" ? (part && { id: part.partSpecId, label: part.label, variantId: null })
    : kind === "BOARD" ? (board && { id: board.boardId, label: board.label, variantId: null })
    : (model && { id: model.modelId, label: model.label, variantId: model.variantId });

  async function submit() {
    setError(null);
    setResult(null);
    if (!target) return setError(kind === "PART" ? "부품 규격을 선택해 주세요." : kind === "BOARD" ? "메인보드를 선택해 주세요." : "모델을 선택해 주세요.");
    if (!file) return setError("사진을 선택해 주세요.");
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("targetId", target.id);
    fd.append("targetLabel", target.label);
    if (target.variantId) fd.append("variantId", target.variantId);
    fd.append("file", file);
    setBusy(true);
    try {
      const res = await recognizePhotoAction(fd);
      if (res.error) setError(res.error);
      else if (res.result) {
        setResult(res.result);
        setFile(null);
      }
    } catch {
      setError("요청 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-gray-700">1. 사진 종류</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button key={k} type="button" disabled={busy} onClick={() => { setKind(k); setResult(null); setError(null); }}
                className={`rounded-full border px-3 py-1 text-sm ${k === kind ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
                {PHOTO_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="mb-2 text-sm font-semibold text-gray-700">2. {TARGET_HINT[kind]}</p>
          {kind === "PART" && <PartSpecPicker value={part} onChange={setPart} disabled={busy} />}
          {kind === "BOARD" && <BoardPicker value={board} onChange={setBoard} />}
          {kind === "DEVICE" && <DeviceModelPicker value={model} onChange={setModel} />}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-gray-700">3. 사진</p>
          <p className="mb-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
            사진은 외부 AI(OpenRouter)로 전송됩니다. 고객 이름·전화번호·주소가 보이지 않게 촬영하세요.
          </p>
          <input type="file" accept="image/*" capture="environment" disabled={busy}
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
            className="block text-sm" />
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- 로컬 미리보기(blob URL)
            <img src={preview} alt="선택한 사진 미리보기" className="mt-2 max-h-64 rounded border border-gray-200 object-contain" />
          )}
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={submit} disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? "인식 중…" : "인식 요청"}
          </button>
          {busy && <span className="text-xs text-gray-500">AI가 사진을 읽고 있습니다. 최대 1분 정도 걸릴 수 있습니다.</span>}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      {result && <RecognitionResult result={result} />}
    </div>
  );
}
