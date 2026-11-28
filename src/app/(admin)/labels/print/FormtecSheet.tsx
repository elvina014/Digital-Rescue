"use client";

import { LabelCard } from "./LabelSheet";
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  LABEL_HEIGHT_MM,
  LABEL_WIDTH_MM,
  SHEET_CELLS,
  cellPosition,
  type PrintLabel,
  type SheetLayout,
} from "./labelLayout";

/** FORMTEC 3102 (A4 40칸): 용지에 맞춰 칸 위치에 인쇄 */
const FORMTEC_PRINT_CSS = `
@page { size: A4; margin: 0; }
@media print {
  body * { visibility: hidden; }
  .label-sheet, .label-sheet * { visibility: visible; }
  .label-sheet { position: absolute; left: 0; top: 0; display: block !important; gap: 0 !important; overflow: visible !important; }
  .label-sheet .sheet-page { box-shadow: none !important; border: none !important; margin: 0 !important; break-after: page; page-break-after: always; }
  .label-sheet .sheet-page:last-child { break-after: auto; page-break-after: auto; }
  .label-sheet .no-print { display: none !important; }
}
`;

/** 1페이지는 '이미 사용한 칸'을 건너뛰고, 넘치면 다음 페이지(빈 용지)부터 1번 칸 */
function assignCells(count: number, usedCells: Set<number>): { page: number; cell: number }[] {
  const out: { page: number; cell: number }[] = [];
  let page = 0;
  let cell = 0;
  while (out.length < count) {
    if (cell >= SHEET_CELLS) {
      page++;
      cell = 0;
    }
    if (!(page === 0 && usedCells.has(cell))) out.push({ page, cell });
    cell++;
  }
  return out;
}

export default function FormtecSheet({
  labels,
  layout,
  usedCells,
  onToggleCell,
  showOutlines,
}: {
  labels: PrintLabel[];
  layout: SheetLayout;
  usedCells: Set<number>;
  onToggleCell: (cell: number) => void;
  /** 시험 인쇄: 40칸 테두리를 함께 인쇄 (일반 용지에 인쇄해 라벨지와 겹쳐 보기) */
  showOutlines: boolean;
}) {
  const slots = assignCells(labels.length, usedCells);
  const pageCount = Math.max(1, (slots.at(-1)?.page ?? 0) + 1);

  return (
    <>
      <style>{FORMTEC_PRINT_CSS}</style>
      <div className="label-sheet space-y-4 overflow-x-auto">
        {Array.from({ length: pageCount }, (_, page) => (
          <div
            key={page}
            className="sheet-page relative shrink-0 bg-white shadow-md ring-1 ring-gray-200"
            style={{ width: `${A4_WIDTH_MM}mm`, height: `${A4_HEIGHT_MM}mm` }}
          >
            {Array.from({ length: SHEET_CELLS }, (_, cell) => {
              const { x, y } = cellPosition(cell, layout);
              const labelIdx = slots.findIndex((s) => s.page === page && s.cell === cell);
              const used = page === 0 && usedCells.has(cell);
              const pos = { left: `${x}mm`, top: `${y}mm`, width: `${LABEL_WIDTH_MM}mm`, height: `${LABEL_HEIGHT_MM}mm` };
              return (
                <div key={cell} className="absolute" style={pos}>
                  {labelIdx >= 0 && <LabelCard label={labels[labelIdx]} className="absolute inset-0" />}
                  {showOutlines && <div className="pointer-events-none absolute inset-0 border border-gray-400" />}
                  {page === 0 ? (
                    <button
                      type="button"
                      onClick={() => onToggleCell(cell)}
                      title={used ? "사용 가능으로 되돌리기" : "이미 사용한 칸으로 표시"}
                      className={`no-print absolute inset-0 border border-dashed text-[8pt] ${
                        used
                          ? "border-gray-400 bg-[repeating-linear-gradient(45deg,#e5e7eb_0_4px,#f9fafb_4px_8px)] text-gray-500"
                          : labelIdx >= 0
                            ? "border-blue-300 hover:bg-red-50/40"
                            : "border-gray-300 text-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      {used ? "사용함" : labelIdx >= 0 ? "" : cell + 1}
                    </button>
                  ) : (
                    <div className="no-print pointer-events-none absolute inset-0 border border-dashed border-gray-200" />
                  )}
                </div>
              );
            })}
            <span className="no-print absolute right-2 top-1 text-[8pt] text-gray-400">{page + 1}페이지</span>
          </div>
        ))}
      </div>
    </>
  );
}
