/**
 * 라벨 레이아웃 (mm/pt) — 인쇄 화면(LabelCard)과 PNG 이미지(labelImage)가 같은 값을 쓴다.
 * 라벨 크기: FORMTEC 3102 한 칸 (47 × 26.9 mm)
 */
export const LABEL_WIDTH_MM = 47;
export const LABEL_HEIGHT_MM = 26.9;

export const LABEL_PAD_MM = 1.5;
export const LABEL_QR_MM = 19;
/** QR과 글자 사이 간격 */
export const LABEL_GAP_MM = 1.5;
/** 줄 간격 (Tailwind leading-tight) */
export const LABEL_LINE_HEIGHT = 1.25;
/** 모델명 최대 줄 수 (넘치면 말줄임) */
export const LABEL_LINE_MAX_LINES = 3;

export const LABEL_FONT_PT = {
  code: 10,
  line: 8.5,
  sub: 6,
  location: 7,
} as const;

export interface PrintLabel {
  code: string;
  line: string;
  sub: string;
  location: string | null;
  qrSvg: string;
  /** QR이 가리키는 주소 (PNG 생성 시 QR을 다시 그릴 때 사용) */
  scanUrl: string;
}

/** FORMTEC 3102 (A4, 4열 × 10행) 배치 — 왼쪽·위쪽 여백과 칸 간격 기준. 기본값은 실제 용지 측정값 */
export interface SheetLayout {
  leftMm: number;
  topMm: number;
  colGapMm: number;
  rowGapMm: number;
}

export const SHEET_COLS = 4;
export const SHEET_ROWS = 10;
export const SHEET_CELLS = SHEET_COLS * SHEET_ROWS;
export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

export const DEFAULT_SHEET_LAYOUT: SheetLayout = { leftMm: 6.5, topMm: 14.8, colGapMm: 2, rowGapMm: 0 };

/** 칸 번호(0부터, 왼쪽→오른쪽, 위→아래) → 용지 위 좌표(mm) */
export function cellPosition(index: number, layout: SheetLayout): { x: number; y: number } {
  const col = index % SHEET_COLS;
  const row = Math.floor(index / SHEET_COLS);
  return {
    x: layout.leftMm + col * (LABEL_WIDTH_MM + layout.colGapMm),
    y: layout.topMm + row * (LABEL_HEIGHT_MM + layout.rowGapMm),
  };
}
