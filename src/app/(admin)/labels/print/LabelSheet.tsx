/** 라벨 크기 (감열 라벨 프린터, 1장 = 1페이지) — 용지가 바뀌면 이 값만 수정 */
export const LABEL_WIDTH_MM = 50;
export const LABEL_HEIGHT_MM = 30;

export interface PrintLabel {
  code: string;
  line: string;
  sub: string;
  location: string | null;
  qrSvg: string;
}

/** 인쇄 시 라벨 영역만 출력 (관리자 화면의 사이드바·헤더 숨김) */
const PRINT_CSS = `
@page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
.label { width: ${LABEL_WIDTH_MM}mm; height: ${LABEL_HEIGHT_MM}mm; }
@media print {
  body * { visibility: hidden; }
  .label-sheet, .label-sheet * { visibility: visible; }
  .label-sheet { position: absolute; left: 0; top: 0; display: block !important; gap: 0 !important; }
  .label { border: none !important; break-after: page; page-break-after: always; }
}
`;

export default function LabelSheet({ labels }: { labels: PrintLabel[] }) {
  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="label-sheet flex flex-wrap gap-3">
        {labels.map((l) => (
          <div key={l.code} className="label flex items-center gap-[1.5mm] overflow-hidden border border-dashed border-gray-400 bg-white p-[1.5mm] text-black">
            <div className="h-[26mm] w-[26mm] shrink-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: l.qrSvg }} />
            <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch leading-tight">
              <p className="font-mono text-[11pt] font-bold">{l.code}</p>
              <p className="line-clamp-3 break-all text-[6.5pt]">{l.line}</p>
              <p className="text-[6.5pt]">{l.sub}</p>
              {l.location && <p className="font-mono text-[7pt] font-semibold">{l.location}</p>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
