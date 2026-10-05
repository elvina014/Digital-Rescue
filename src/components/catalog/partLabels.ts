/** 부품 규격·호환성 코드 → 한국어 표시 (Phase 3) */

export const PART_TYPE_LABEL: Record<string, string> = {
  PANEL: "액정",
  BATTERY: "배터리",
  KEYBOARD: "키보드",
  IC: "칩/IC",
  STORAGE: "저장장치",
  MEMORY: "메모리",
  MAINBOARD: "메인보드",
  CABLE: "케이블",
  FAN: "팬/쿨러",
  CASE: "케이스",
  ADAPTER: "어댑터",
  OTHER: "기타",
};

export const COMPAT_TARGET_LABEL: Record<string, string> = { MODEL: "모델/변형 기준", BOARD: "메인보드 기준" };

export const COMPAT_STATUS_LABEL: Record<string, string> = {
  compatible: "호환",
  conditional: "조건부",
  incompatible: "비호환",
  unknown: "미확인",
};

export const COMPAT_STATUS_CLASS: Record<string, string> = {
  compatible: "bg-green-100 text-green-800",
  conditional: "bg-amber-100 text-amber-800",
  incompatible: "bg-red-100 text-red-700",
  unknown: "bg-gray-100 text-gray-600",
};

export const CONFIDENCE_LABEL: Record<string, string> = { verified: "검증됨", documented: "문서 근거", inferred: "추정" };

export const EVIDENCE_KIND_LABEL: Record<string, string> = {
  INSTALL: "실장 확인",
  DOCUMENT: "문서 근거",
  INFERENCE: "추정",
  OVERRIDE: "관리자 조정",
};

export const ALIAS_TYPE_LABEL: Record<string, string> = { PART_NUMBER: "품번", MARKING: "마킹", OTHER: "기타" };

/** 사용 부품 호환 확인 응답 */
export const INSTALL_ANSWER_LABEL: Record<string, string> = {
  OK: "정상동작",
  CONDITIONAL: "조건부",
  INCOMPATIBLE: "비호환",
  UNKNOWN: "판단불가",
};

export interface CompatCounts {
  install_ok: number | null;
  install_conditional: number | null;
  install_incompatible: number | null;
  document_count: number | null;
  inference_count: number | null;
}

/** "정상 2 · 조건부 1 · 문서 1" 형태의 근거 건수 요약 (0건인 항목은 생략) */
export function evidenceCountText(c: CompatCounts): string {
  const parts = [
    c.install_ok ? `정상 ${c.install_ok}` : "",
    c.install_conditional ? `조건부 ${c.install_conditional}` : "",
    c.install_incompatible ? `비호환 ${c.install_incompatible}` : "",
    c.document_count ? `문서 ${c.document_count}` : "",
    c.inference_count ? `추정 ${c.inference_count}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}
