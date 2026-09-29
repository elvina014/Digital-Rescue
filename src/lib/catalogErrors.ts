/**
 * 기기 마스터(catalog_*) DB 오류 → 한국어 안내 문구
 * RPC의 RAISE EXCEPTION(P0001) 메시지는 이미 한국어이므로 그대로 사용한다.
 */
export function catalogErrorMessage(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return "알 수 없는 오류가 발생했습니다.";
  switch (error.code) {
    case "P0001":
      return error.message ?? "요청을 처리할 수 없습니다.";
    case "23505":
      return "이미 등록된 이름(또는 별칭)입니다.";
    case "23503":
      return "사용 중인 항목은 삭제할 수 없습니다. (연결된 접수건·별칭·보드를 먼저 확인해 주세요)";
    case "23514":
      return "입력값이 올바르지 않습니다. (길이·연도 등을 확인해 주세요)";
    case "42501":
      return "권한이 없습니다.";
    default:
      return "처리에 실패했습니다: " + (error.message ?? "");
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 폼 값 → uuid 또는 null (빈 값/형식 오류는 null) */
export function toUuidOrNull(value: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return UUID_RE.test(v) ? v : null;
}
