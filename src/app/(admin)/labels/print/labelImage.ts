import QRCode from "qrcode";
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

/** 라벨 PNG 해상도 — 300 DPI면 47 × 26.9 mm = 555 × 318 px */
export const LABEL_DPI = 300;
const PX_PER_MM = LABEL_DPI / 25.4;
const PX_PER_PT = LABEL_DPI / 72;
const mm = (v: number) => v * PX_PER_MM;

interface Fonts {
  sans: string;
  mono: string;
}

/** 화면 라벨에 실제로 적용된 글꼴을 그대로 사용 (없으면 기본 글꼴) */
function readFonts(): Fonts {
  const pick = (sel: string, fallback: string) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).fontFamily : fallback;
  };
  return {
    sans: pick('.label [data-font="sans"]', getComputedStyle(document.body).fontFamily || "sans-serif"),
    mono: pick('.label [data-font="mono"]', "monospace"),
  };
}

/** 글자 단위 줄바꿈 (화면의 break-all과 동일), 최대 줄 수를 넘으면 마지막 줄 말줄임 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const ch of Array.from(text)) {
    if (cur && ctx.measureText(cur + ch).width > maxWidth) {
      lines.push(cur);
      cur = ch;
    } else {
      cur += ch;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = last + "…";
  return kept;
}

function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = size / n;
  ctx.fillStyle = "#000";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      // 정수 경계로 맞춰 모듈 사이 틈이 생기지 않게 한다
      const x0 = Math.round(x + c * cell);
      const y0 = Math.round(y + r * cell);
      ctx.fillRect(x0, y0, Math.round(x + (c + 1) * cell) - x0, Math.round(y + (r + 1) * cell) - y0);
    }
  }
}

/** 라벨 1장을 Canvas에 그린다 — 배치는 LabelCard(화면·인쇄)와 같은 값 */
function renderLabel(label: PrintLabel, fonts: Fonts): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(mm(LABEL_WIDTH_MM));
  canvas.height = Math.round(mm(LABEL_HEIGHT_MM));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawQr(ctx, label.scanUrl, mm(LABEL_PAD_MM), mm((LABEL_HEIGHT_MM - LABEL_QR_MM) / 2), mm(LABEL_QR_MM));

  const textLeft = mm(LABEL_PAD_MM + LABEL_QR_MM + LABEL_GAP_MM);
  const textWidth = mm(LABEL_WIDTH_MM) - textLeft - mm(LABEL_PAD_MM);
  const textTop = mm(LABEL_PAD_MM);
  const textHeight = mm(LABEL_HEIGHT_MM - LABEL_PAD_MM * 2);

  // 블록(코드·모델명·분류·위치)을 위아래로 균등 배치 (화면의 justify-between)
  type Block = { font: string; lines: string[]; lineH: number };
  const block = (pt: number, weight: number, family: string, text: string, maxLines: number): Block => {
    const font = `${weight} ${pt * PX_PER_PT}px ${family}`;
    ctx.font = font;
    return { font, lines: wrapText(ctx, text, textWidth, maxLines), lineH: pt * PX_PER_PT * LABEL_LINE_HEIGHT };
  };
  const blocks: Block[] = [
    block(LABEL_FONT_PT.code, 700, fonts.mono, label.code, 1),
    block(LABEL_FONT_PT.line, 600, fonts.sans, label.line, LABEL_LINE_MAX_LINES),
    block(LABEL_FONT_PT.sub, 400, fonts.sans, label.sub, 1),
  ];
  if (label.location) blocks.push(block(LABEL_FONT_PT.location, 700, fonts.mono, label.location, 1));

  const used = blocks.reduce((s, b) => s + b.lines.length * b.lineH, 0);
  const gap = blocks.length > 1 ? Math.max(0, (textHeight - used) / (blocks.length - 1)) : 0;
  ctx.fillStyle = "#000";
  ctx.textBaseline = "middle";
  let y = textTop;
  for (const b of blocks) {
    ctx.font = b.font;
    for (const line of b.lines) {
      ctx.fillText(line, textLeft, y + b.lineH / 2);
      y += b.lineH;
    }
    y += gap;
  }
  return canvas;
}

// ── PNG에 해상도(pHYs) 기록: 폼텍 프로그램이 실제 크기(mm)로 인식하도록 ──

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** IHDR 바로 뒤에 pHYs 청크 삽입 (PNG 시그니처 8 + IHDR 25 = 33바이트 지점) */
function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  view.setUint32(8, ppm);
  view.setUint32(12, ppm);
  chunk[16] = 1; // 단위: 미터
  view.setUint32(17, crc32(chunk.subarray(4, 17)));
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, 33), 0);
  out.set(chunk, 33);
  out.set(png.subarray(33), 33 + chunk.length);
  return out;
}

async function labelPng(label: PrintLabel, fonts: Fonts): Promise<Blob> {
  const canvas = renderLabel(label, fonts);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG 생성 실패"))), "image/png"),
  );
  const bytes = withDpi(new Uint8Array(await blob.arrayBuffer()), LABEL_DPI);
  return new Blob([bytes as BlobPart], { type: "image/png" });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 라벨들을 PNG로 저장 (라벨마다 파일 1개: P-00012.png) */
export async function downloadLabelImages(labels: PrintLabel[]): Promise<void> {
  await document.fonts.ready;
  const fonts = readFonts();
  for (let i = 0; i < labels.length; i++) {
    saveBlob(await labelPng(labels[i], fonts), `${labels[i].code}.png`);
    // 연속 다운로드가 막히지 않도록 간격을 둔다
    if (i < labels.length - 1) await new Promise((r) => setTimeout(r, 300));
  }
}
