"use client";

import { useEffect, useState } from "react";
import LabelSheet from "./LabelSheet";
import FormtecSheet from "./FormtecSheet";
import { downloadLabelImages } from "./labelImage";
import { DEFAULT_SHEET_LAYOUT, LABEL_HEIGHT_MM, LABEL_WIDTH_MM, type PrintLabel, type SheetLayout } from "./labelLayout";

type Mode = "formtec" | "thermal";

/** PC(프린터)마다 다른 값이라 브라우저에만 저장 */
const MODE_KEY = "label-print-mode";
const LAYOUT_KEY = "label-sheet-formtec3102";

const LAYOUT_FIELDS: { key: keyof SheetLayout; label: string }[] = [
  { key: "leftMm", label: "왼쪽 여백" },
  { key: "topMm", label: "위쪽 여백" },
  { key: "colGapMm", label: "가로 간격" },
  { key: "rowGapMm", label: "세로 간격" },
];

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패해도 이번 인쇄에는 지장 없음
  }
}

export default function LabelPrintClient({ labels }: { labels: PrintLabel[] }) {
  const [mode, setMode] = useState<Mode>("formtec");
  const [layout, setLayout] = useState<SheetLayout>(DEFAULT_SHEET_LAYOUT);
  const [usedCells, setUsedCells] = useState<Set<number>>(new Set());
  const [showOutlines, setShowOutlines] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 저장된 설정은 마운트 후에 읽는다 (서버 렌더와 첫 화면을 맞추기 위해)
    setMode(load<{ mode: Mode }>(MODE_KEY, { mode: "formtec" }).mode);
    setLayout(load(LAYOUT_KEY, DEFAULT_SHEET_LAYOUT));
  }, []);

  const changeMode = (m: Mode) => {
    setMode(m);
    save(MODE_KEY, { mode: m });
  };
  const changeLayout = (key: keyof SheetLayout, value: number) => {
    const next = { ...layout, [key]: value };
    setLayout(next);
    save(LAYOUT_KEY, next);
  };
  const resetLayout = () => {
    setLayout(DEFAULT_SHEET_LAYOUT);
    save(LAYOUT_KEY, DEFAULT_SHEET_LAYOUT);
  };
  const toggleCell = (cell: number) =>
    setUsedCells((prev) => {
      const next = new Set(prev);
      if (next.has(cell)) next.delete(cell);
      else next.add(cell);
      return next;
    });

  const saveImages = async (targets: PrintLabel[], key: string) => {
    setSaving(key);
    setError(null);
    try {
      await downloadLabelImages(targets);
    } catch {
      setError("이미지를 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(null);
    }
  };

  const btn = "rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
          {(
            [
              ["formtec", "폼텍 3102 (A4 40칸)"],
              ["thermal", "감열 라벨 (1장=1페이지)"],
            ] as const
          ).map(([m, text]) => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={`rounded-md px-3 py-1.5 ${mode === m ? "bg-white font-semibold text-gray-900 shadow-sm" : "text-gray-600"}`}
            >
              {text}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => saveImages(labels, "all")}
            disabled={saving !== null}
            className={`${btn} border border-gray-300 bg-white text-gray-800 hover:bg-gray-50`}
          >
            {saving === "all" ? "저장 중…" : "이미지 저장 (전체)"}
          </button>
          <button type="button" onClick={() => window.print()} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
            인쇄
          </button>
        </div>
      </div>

      <div className="space-y-1 text-xs text-gray-500">
        <p>
          라벨 {LABEL_WIDTH_MM} × {LABEL_HEIGHT_MM} mm. 인쇄 창에서 <b>여백 &apos;없음&apos;, 배율 100%(실제 크기)</b>로 설정하세요.
        </p>
        <p>이미지는 300 DPI PNG(라벨마다 파일 1개)로 저장됩니다. 여러 장을 저장할 때 브라우저가 &apos;여러 파일 다운로드&apos;를 물으면 허용하세요.</p>
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {mode === "formtec" ? (
        <>
          <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3 text-sm">
            <p className="text-gray-700">
              1페이지에서 <b>이미 사용한 칸을 클릭</b>하면 건너뛰고 다음 칸부터 채웁니다. 칸이 모자라면 다음 장(새 용지)에 이어서 인쇄합니다.
              {usedCells.size > 0 && (
                <button type="button" onClick={() => setUsedCells(new Set())} className="ml-2 text-blue-700 hover:underline">
                  사용한 칸 표시 지우기
                </button>
              )}
            </p>
            <div className="flex flex-wrap items-end gap-3">
              {LAYOUT_FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col text-xs text-gray-600">
                  {f.label} (mm)
                  <input
                    type="number"
                    step={0.1}
                    value={layout[f.key]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v)) changeLayout(f.key, v);
                    }}
                    className="mt-0.5 w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </label>
              ))}
              <button type="button" onClick={resetLayout} className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50">
                기본값
              </button>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={showOutlines} onChange={(e) => setShowOutlines(e.target.checked)} />
                칸 테두리도 인쇄 (위치 맞추기용 시험 인쇄)
              </label>
            </div>
            <p className="text-xs text-gray-500">
              인쇄가 한쪽으로 밀리면 여백 값을 조정하세요 (이 PC에 저장됨). 오른쪽으로 밀리면 왼쪽 여백을 줄이고, 아래로 밀리면 위쪽 여백을 줄입니다.
            </p>
          </div>
          <FormtecSheet labels={labels} layout={layout} usedCells={usedCells} onToggleCell={toggleCell} showOutlines={showOutlines} />
        </>
      ) : (
        <LabelSheet
          labels={labels}
          renderActions={(l) => (
            <button
              type="button"
              onClick={() => saveImages([l], l.code)}
              disabled={saving !== null}
              className="text-xs text-blue-700 hover:underline disabled:opacity-50"
            >
              {saving === l.code ? "저장 중…" : "PNG 저장"}
            </button>
          )}
        />
      )}
    </div>
  );
}
