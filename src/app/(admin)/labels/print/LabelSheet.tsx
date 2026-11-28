import {
  LABEL_FONT_PT,
  LABEL_GAP_MM,
  LABEL_HEIGHT_MM,
  LABEL_LINE_HEIGHT,
  LABEL_LINE_MAX_LINES,
  LABEL_PAD_MM,
  LABEL_QR_MM,
  LABEL_WIDTH_MM,
  type PrintLabel,
} from "./labelLayout";

const TEXT_LEFT_MM = LABEL_PAD_MM + LABEL_QR_MM + LABEL_GAP_MM;

/** 라벨 1장 (47 × 26.9 mm). 크기·글자 값은 labelLayout.ts — PNG 이미지와 같은 배치 */
export function LabelCard({ label, className = "" }: { label: PrintLabel; className?: string }) {
  return (
    <div
      className={`label relative overflow-hidden bg-white text-black ${className}`}
      style={{ width: `${LABEL_WIDTH_MM}mm`, height: `${LABEL_HEIGHT_MM}mm` }}
    >
      <div
        className="absolute [&>svg]:h-full [&>svg]:w-full"
        style={{
          left: `${LABEL_PAD_MM}mm`,
          top: `${(LABEL_HEIGHT_MM - LABEL_QR_MM) / 2}mm`,
          width: `${LABEL_QR_MM}mm`,
          height: `${LABEL_QR_MM}mm`,
        }}
        dangerouslySetInnerHTML={{ __html: label.qrSvg }}
      />
      <div
        className="absolute flex flex-col justify-between"
        style={{
          left: `${TEXT_LEFT_MM}mm`,
          top: `${LABEL_PAD_MM}mm`,
          width: `${LABEL_WIDTH_MM - TEXT_LEFT_MM - LABEL_PAD_MM}mm`,
          height: `${LABEL_HEIGHT_MM - LABEL_PAD_MM * 2}mm`,
          lineHeight: LABEL_LINE_HEIGHT,
        }}
      >
        <p data-font="mono" className="font-mono font-bold" style={{ fontSize: `${LABEL_FONT_PT.code}pt` }}>
          {label.code}
        </p>
        <p
          data-font="sans"
          className="break-all font-semibold"
          style={{
            fontSize: `${LABEL_FONT_PT.line}pt`,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: LABEL_LINE_MAX_LINES,
            overflow: "hidden",
          }}
        >
          {label.line}
        </p>
        <p style={{ fontSize: `${LABEL_FONT_PT.sub}pt` }}>{label.sub}</p>
        {label.location && (
          <p className="font-mono font-bold" style={{ fontSize: `${LABEL_FONT_PT.location}pt` }}>
            {label.location}
          </p>
        )}
      </div>
    </div>
  );
}

/** 감열 라벨 프린터: 1장 = 1페이지 */
const THERMAL_PRINT_CSS = `
@page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
@media print {
  body * { visibility: hidden; }
  .label-sheet, .label-sheet * { visibility: visible; }
  .label-sheet { position: absolute; left: 0; top: 0; display: block !important; gap: 0 !important; }
  .label-sheet .label { border: none !important; }
  .label-sheet > div { break-after: page; page-break-after: always; }
  .label-sheet > div:last-child { break-after: auto; page-break-after: auto; }
  .label-sheet .no-print { display: none !important; }
}
`;

export default function LabelSheet({
  labels,
  renderActions,
}: {
  labels: PrintLabel[];
  /** 라벨 아래 버튼 (인쇄되지 않음) */
  renderActions?: (label: PrintLabel) => React.ReactNode;
}) {
  return (
    <>
      <style>{THERMAL_PRINT_CSS}</style>
      <div className="label-sheet flex flex-wrap gap-3">
        {labels.map((l) => (
          <div key={l.code}>
            <LabelCard label={l} className="border border-dashed border-gray-400" />
            {renderActions && <div className="no-print mt-1">{renderActions(l)}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
