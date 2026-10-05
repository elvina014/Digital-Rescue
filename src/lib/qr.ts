import QRCode from "qrcode";

/** 서버에서 QR 코드 SVG 문자열 생성 (라벨 인쇄용) */
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
}
