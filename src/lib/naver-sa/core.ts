/**
 * 네이버 검색광고 API — 광고노출 제한 IP (docs/click-guard/NAVER-API.md)
 *
 * 서명, 메모 형식, 오류 분류, 등록/해제/현황 흐름을 담는다. 환경변수와 DB는 건드리지 않고 전부 인자로 받는다.
 * node:crypto 외에는 import 하지 않는다 — 단위 테스트(tests/naver-sa)가 Node에서 직접 불러온다.
 * 실제 호출 연결은 client.ts('server-only'), DB 연결은 서버 액션이 한다.
 */
import { createHmac } from "node:crypto";

export const NAVER_SA_BASE_URL = "https://api.searchad.naver.com";
export const IP_EXCLUSIONS_PATH = "/tool/ip-exclusions";
export const NAVER_SA_TIMEOUT_MS = 8000;

/** ERP가 등록한 항목의 메모 표식. 이 표식으로 시작하는 항목만 ERP에서 해제한다 */
export const CG_MEMO_PREFIX = "[CG]";
/** 네이버 메모 최대 길이 (오류 5502) */
export const NAVER_MEMO_MAX = 25;
/** 네이버 등록 상한(화면 표시용)과 ERP 자체 상한(여유분을 남긴다) */
export const NAVER_SLOT_LIMIT = 600;
export const ERP_SLOT_LIMIT = 500;

// ---------- 서명 ----------

/** `timestamp.METHOD.path` → HMAC-SHA256(secret) → Base64. path에는 쿼리스트링을 넣지 않는다 */
export function buildSignature(timestamp: string, method: string, path: string, secretKey: string): string {
  return createHmac("sha256", secretKey).update(`${timestamp}.${method.toUpperCase()}.${path}`).digest("base64");
}

export interface NaverCredentials {
  apiKey: string;
  secretKey: string;
  customerId: string;
}

export function buildAuthHeaders(
  credentials: NaverCredentials,
  method: string,
  path: string,
  timestamp: string
): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=UTF-8",
    "X-Timestamp": timestamp,
    "X-API-KEY": credentials.apiKey,
    "X-Customer": credentials.customerId,
    "X-Signature": buildSignature(timestamp, method, path, credentials.secretKey),
  };
}

// ---------- 메모·IP ----------

/** 네이버에 넣는 메모: `[CG] YYMMDD <사용자 메모 앞부분>` (최대 25자, 날짜는 한국시간) */
export function buildNaverMemo(userMemo: string, now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3_600_000);
  const yymmdd =
    String(kst.getUTCFullYear()).slice(2) +
    String(kst.getUTCMonth() + 1).padStart(2, "0") +
    String(kst.getUTCDate()).padStart(2, "0");
  const head = `${CG_MEMO_PREFIX} ${yymmdd}`;
  const text = userMemo.replace(/\s+/g, " ").trim();
  const room = NAVER_MEMO_MAX - head.length - 1;
  const tail = Array.from(text).slice(0, room).join("").trim();
  return tail ? `${head} ${tail}` : head;
}

export function isCgMemo(memo: string | null | undefined): boolean {
  return !!memo && memo.trimStart().startsWith(CG_MEMO_PREFIX);
}

export function isIpv4(value: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) return false;
  return value.split(".").every((n) => Number(n) <= 255);
}

export interface NaverExclusion {
  ipFilterId: string;
  filterIp: string;
  memo: string | null;
  regTm: string | null;
}

function toExclusion(item: unknown): NaverExclusion | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const id = o.ipFilterId;
  if ((typeof id !== "number" && typeof id !== "string") || typeof o.filterIp !== "string") return null;
  return {
    ipFilterId: String(id),
    filterIp: o.filterIp.trim(),
    memo: typeof o.memo === "string" ? o.memo : null,
    regTm: typeof o.regTm === "string" ? o.regTm : null,
  };
}

/** 목록 응답(IpExclusion[])을 읽는다. 형식이 다른 항목은 버린다 */
export function parseExclusionList(json: unknown): NaverExclusion[] {
  if (!Array.isArray(json)) return [];
  return json.map(toExclusion).filter((x): x is NaverExclusion => x !== null);
}

/** 와일드카드 항목(예: 1.2.3.*)이 이 IP를 포함하는지 */
function wildcardCovers(pattern: string, ip: string): boolean {
  if (!pattern.includes("*")) return false;
  const p = pattern.split(".");
  const a = ip.split(".");
  return p.length === 4 && a.length === 4 && p.every((part, i) => part === "*" || part === a[i]);
}

/** 목록에서 이 IP와 정확히 같은 항목, 이 IP를 덮는 와일드카드 항목을 찾는다 */
export function findExclusion(
  list: NaverExclusion[],
  ip: string
): { exact: NaverExclusion | null; wildcard: NaverExclusion | null } {
  return {
    exact: list.find((x) => x.filterIp === ip) ?? null,
    wildcard: list.find((x) => wildcardCovers(x.filterIp, ip)) ?? null,
  };
}

// ---------- 오류 ----------

export type NaverErrorKind =
  | "config"
  | "timeout"
  | "network"
  | "auth"
  | "rate"
  | "limit"
  | "duplicate"
  | "memo"
  | "not_found"
  | "maintenance"
  | "invalid"
  | "unknown";

const ERROR_MESSAGE: Record<NaverErrorKind, string> = {
  config: "네이버 API 키가 설정되지 않았습니다. 서버 환경변수(NAVER_SA_*)를 확인해 주세요.",
  timeout: "네이버 응답이 지연되고 있습니다. 잠시 후 [네이버 등록 현황 확인]으로 반영 여부를 확인해 주세요.",
  network: "네이버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  auth: "네이버 API 인증에 실패했습니다. API 키·비밀키·고객 ID를 확인해 주세요.",
  rate: "네이버 API 호출이 많아 거부되었습니다. 5분쯤 뒤에 다시 시도해 주세요.",
  limit: "네이버 광고노출 제한 등록 개수가 가득 찼습니다(슬롯 부족). 오래된 항목을 정리해 주세요.",
  duplicate: "이미 네이버에 등록된 IP입니다.",
  memo: "네이버 메모 길이 제한(25자)을 넘었습니다.",
  not_found: "네이버에서 해당 항목을 찾지 못했습니다. 이미 삭제되었을 수 있습니다.",
  maintenance: "네이버 검색광고 API가 점검 중입니다. 잠시 후 다시 시도해 주세요.",
  invalid: "네이버가 요청을 거부했습니다. IP 형식을 확인해 주세요.",
  unknown: "네이버 API 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

export function naverErrorMessage(kind: NaverErrorKind): string {
  return ERROR_MESSAGE[kind];
}

export class NaverSaError extends Error {
  kind: NaverErrorKind;
  status: number | null;
  code: number | null;
  /** 응답 본문 앞부분 (로그용) */
  raw: string | null;

  constructor(kind: NaverErrorKind, info: { status?: number; code?: number | null; raw?: string } = {}) {
    super(ERROR_MESSAGE[kind]);
    this.name = "NaverSaError";
    this.kind = kind;
    this.status = info.status ?? null;
    this.code = info.code ?? null;
    this.raw = info.raw ?? null;
  }
}

/** HTTP 상태와 본문의 code(공식 오류 코드 표)로 오류를 분류한다. 본문 형식은 문서에 없어 방어적으로 읽는다 */
export function classifyNaverError(status: number, body: unknown): { kind: NaverErrorKind; code: number | null } {
  const rawCode = body && typeof body === "object" ? (body as Record<string, unknown>).code : null;
  const code = typeof rawCode === "number" ? rawCode : typeof rawCode === "string" && /^\d+$/.test(rawCode) ? Number(rawCode) : null;

  let kind: NaverErrorKind;
  if (code === 5503) kind = "duplicate";
  else if (code === 5502) kind = "memo";
  else if (code === 5501) kind = "not_found";
  else if (code === 1014) kind = "limit";
  else if (code === 1016 || status === 429) kind = "rate";
  else if (code === 1018 || code === 1006 || status === 401 || status === 403) kind = "auth";
  else if (status === 503) kind = "maintenance";
  else if (status === 404) kind = "not_found";
  else if (status >= 400 && status < 500) kind = "invalid";
  else kind = "unknown";
  return { kind, code };
}

// ---------- API 호출 ----------

export interface NaverApi {
  list(): Promise<NaverExclusion[]>;
  create(ip: string, memo: string): Promise<NaverExclusion>;
  remove(ipFilterId: string): Promise<void>;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal; cache?: "no-store" }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export function createNaverApi(options: {
  credentials: NaverCredentials | null;
  fetchImpl: FetchLike;
  now?: () => number;
  timeoutMs?: number;
}): NaverApi {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? NAVER_SA_TIMEOUT_MS;

  async function request(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<unknown> {
    if (!options.credentials) throw new NaverSaError("config");
    let response;
    try {
      response = await options.fetchImpl(NAVER_SA_BASE_URL + path, {
        method,
        headers: buildAuthHeaders(options.credentials, method, path, String(now())),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      throw new NaverSaError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
    }
    const text = await response.text().catch(() => "");
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const { kind, code } = classifyNaverError(response.status, json);
      throw new NaverSaError(kind, { status: response.status, code, raw: text.slice(0, 500) });
    }
    return json;
  }

  const list = async () => parseExclusionList(await request("GET", IP_EXCLUSIONS_PATH));

  return {
    list,
    async create(ip, memo) {
      const created = toExclusion(await request("POST", IP_EXCLUSIONS_PATH, { filterIp: ip, memo }));
      if (created) return created;
      // 응답에서 항목 ID를 읽지 못하면(응답 형식이 문서와 다른 경우) 목록에서 다시 찾는다
      const found = findExclusion(await list(), ip).exact;
      if (found) return found;
      throw new NaverSaError("unknown", { raw: "등록 응답에서 항목 ID를 확인하지 못했습니다" });
    },
    async remove(ipFilterId) {
      await request("DELETE", `${IP_EXCLUSIONS_PATH}/${encodeURIComponent(ipFilterId)}`);
    },
  };
}

// ---------- 등록/해제/현황 흐름 ----------

export type NaverSource = "api" | "manual";

export interface BlockLogEntry {
  ip: string | null;
  action: "register" | "unregister" | "sync";
  result: "success" | "fail" | "skipped";
  filterId?: string | null;
  detail: Record<string, unknown>;
}

/** DB 쪽 동작. 실패하면 throw 한다 (log 제외 — log 실패는 흐름을 막지 않는다) */
export interface BlockDb {
  isWhitelisted(ip: string): Promise<boolean>;
  markRegistered(ip: string, filterId: string | null, memo: string | null, source: NaverSource): Promise<void>;
  markUnregistered(ip: string): Promise<void>;
  listErpBlocked(): Promise<{ ip: string; source: NaverSource | null }[]>;
  log(entry: BlockLogEntry): Promise<void>;
}

export interface FlowResult {
  ok: boolean;
  message: string;
  /** 성공했을 때 ERP에 반영된 상태 */
  source?: NaverSource | null;
}

export interface NaverBlockStatus {
  total: number;
  limit: number;
  erpLimit: number;
  cgCount: number;
  /** ERP에는 네이버 등록완료인데 네이버 목록에 없다 */
  missingInNaver: { ip: string; source: NaverSource | null }[];
  /** 네이버에 [CG] 항목이 있는데 ERP에는 등록완료 표시가 없다 */
  missingInErp: { ip: string; filterId: string; memo: string | null }[];
}

const DB_ERROR = "ERP 기록에 실패했습니다. 잠시 후 다시 시도해 주세요.";

function errorDetail(e: unknown): Record<string, unknown> {
  if (e instanceof NaverSaError) return { kind: e.kind, status: e.status, code: e.code, raw: e.raw };
  return { kind: "db", message: e instanceof Error ? e.message : String(e) };
}

async function safeLog(db: BlockDb, entry: BlockLogEntry): Promise<void> {
  try {
    await db.log(entry);
  } catch {
    // 로그 실패가 등록/해제 결과를 바꾸면 안 된다
  }
}

export async function registerNaverBlockFlow(
  input: { ip: string; memo: string; adminName: string; now: Date },
  api: NaverApi,
  db: BlockDb
): Promise<FlowResult> {
  const ip = input.ip.trim();
  const memo = input.memo.trim();
  if (!isIpv4(ip)) {
    return { ok: false, message: ip.includes(":") ? "IPv4만 등록할 수 있습니다. (IPv6는 지원 여부 확인 전)" : "IP 형식이 올바르지 않습니다." };
  }
  if (!memo) return { ok: false, message: "메모를 입력해 주세요." };
  if (memo.length > 500) return { ok: false, message: "메모는 500자 이내로 입력해 주세요." };

  const base = { memo, admin: input.adminName };
  const fail = async (message: string, detail: Record<string, unknown>, filterId?: string | null): Promise<FlowResult> => {
    await safeLog(db, { ip, action: "register", result: "fail", filterId, detail: { ...base, ...detail } });
    return { ok: false, message };
  };

  try {
    if (await db.isWhitelisted(ip)) {
      return await fail("화이트리스트에 있는 IP는 차단 등록할 수 없습니다.", { reason: "whitelisted" });
    }
  } catch (e) {
    return await fail(DB_ERROR, { reason: "whitelist_check_failed", error: errorDetail(e) });
  }

  let list: NaverExclusion[];
  try {
    list = await api.list();
  } catch (e) {
    return await fail(e instanceof NaverSaError ? e.message : naverErrorMessage("unknown"), { step: "list", error: errorDetail(e) });
  }

  // 이미 네이버에 있는 IP는 새로 등록하지 않고 ERP 표시만 맞춘다
  const { exact, wildcard } = findExclusion(list, ip);
  const existing = exact ?? wildcard;
  if (existing) {
    const source: NaverSource = exact && isCgMemo(exact.memo) ? "api" : "manual";
    const filterId = exact ? exact.ipFilterId : null;
    try {
      await db.markRegistered(ip, filterId, memo, source);
    } catch (e) {
      return await fail(DB_ERROR, { step: "mark_existing", error: errorDetail(e) }, existing.ipFilterId);
    }
    await safeLog(db, {
      ip,
      action: "register",
      result: "skipped",
      filterId: existing.ipFilterId,
      detail: { ...base, reason: exact ? (source === "api" ? "already_cg" : "already_manual") : "covered_by_wildcard", naver_ip: existing.filterIp, naver_memo: existing.memo },
    });
    const message =
      source === "api"
        ? "이미 ERP가 네이버에 등록한 IP입니다. ERP 표시만 등록 완료로 맞췄습니다."
        : exact
          ? "네이버에 직접 등록되어 있는 IP입니다. 새로 등록하지 않고 수동 등록으로 표시했습니다."
          : `네이버에 직접 등록한 대역(${existing.filterIp})으로 이미 차단되어 있습니다. 수동 등록으로 표시했습니다.`;
    return { ok: true, message, source };
  }

  if (list.length >= ERP_SLOT_LIMIT) {
    return await fail(
      `슬롯 부족: 네이버 등록 수가 ${list.length}개로 ERP 상한(${ERP_SLOT_LIMIT}개)에 도달했습니다. 오래된 항목을 정리한 뒤 등록해 주세요.`,
      { reason: "slot_full", total: list.length }
    );
  }

  const naverMemo = buildNaverMemo(memo, input.now);
  let created: NaverExclusion;
  try {
    created = await api.create(ip, naverMemo);
  } catch (e) {
    return await fail(e instanceof NaverSaError ? e.message : naverErrorMessage("unknown"), { step: "create", naver_memo: naverMemo, error: errorDetail(e) });
  }

  try {
    await db.markRegistered(ip, created.ipFilterId, memo, "api");
  } catch (e) {
    // 네이버에는 등록됐다. 다시 [네이버에 차단 등록]을 누르면 위의 "이미 있음" 단계에서 ERP 표시가 맞춰진다
    return await fail(
      "네이버에는 등록됐지만 ERP 기록에 실패했습니다. [네이버에 차단 등록]을 다시 누르면 자동으로 맞춰집니다.",
      { step: "mark_after_create", naver_memo: naverMemo, error: errorDetail(e) },
      created.ipFilterId
    );
  }

  await safeLog(db, { ip, action: "register", result: "success", filterId: created.ipFilterId, detail: { ...base, naver_memo: naverMemo, total_before: list.length } });
  return { ok: true, message: `${ip}를 네이버 광고노출 제한에 등록했습니다.`, source: "api" };
}

export async function unregisterNaverBlockFlow(input: { ip: string; adminName: string }, api: NaverApi, db: BlockDb): Promise<FlowResult> {
  const ip = input.ip.trim();
  if (!isIpv4(ip)) return { ok: false, message: "IP 형식이 올바르지 않습니다." };

  const base = { admin: input.adminName };
  const fail = async (message: string, detail: Record<string, unknown>, filterId?: string | null): Promise<FlowResult> => {
    await safeLog(db, { ip, action: "unregister", result: "fail", filterId, detail: { ...base, ...detail } });
    return { ok: false, message };
  };

  let list: NaverExclusion[];
  try {
    list = await api.list();
  } catch (e) {
    return await fail(e instanceof NaverSaError ? e.message : naverErrorMessage("unknown"), { step: "list", error: errorDetail(e) });
  }

  const { exact, wildcard } = findExclusion(list, ip);
  if (exact && !isCgMemo(exact.memo)) {
    return await fail("네이버에서 직접 등록한 항목이라 ERP에서 해제할 수 없습니다.", { reason: "manual_entry", naver_memo: exact.memo }, exact.ipFilterId);
  }
  if (!exact && wildcard) {
    return await fail(
      `네이버에서 직접 등록한 대역(${wildcard.filterIp})이라 ERP에서 해제할 수 없습니다.`,
      { reason: "manual_wildcard", naver_ip: wildcard.filterIp },
      wildcard.ipFilterId
    );
  }

  if (exact) {
    try {
      await api.remove(exact.ipFilterId);
    } catch (e) {
      // 이미 삭제된 항목이면 해제된 것으로 본다
      if (!(e instanceof NaverSaError && e.kind === "not_found")) {
        return await fail(e instanceof NaverSaError ? e.message : naverErrorMessage("unknown"), { step: "remove", error: errorDetail(e) }, exact.ipFilterId);
      }
    }
  }

  try {
    await db.markUnregistered(ip);
  } catch (e) {
    return await fail(
      exact ? "네이버에서는 해제됐지만 ERP 기록에 실패했습니다. [차단 해제]를 다시 눌러 주세요." : DB_ERROR,
      { step: "mark_unregistered", error: errorDetail(e) },
      exact?.ipFilterId
    );
  }

  if (!exact) {
    await safeLog(db, { ip, action: "unregister", result: "skipped", detail: { ...base, reason: "not_in_naver" } });
    return { ok: true, message: "네이버 목록에 없는 IP입니다. ERP 표시만 해제했습니다.", source: null };
  }
  await safeLog(db, { ip, action: "unregister", result: "success", filterId: exact.ipFilterId, detail: { ...base, naver_memo: exact.memo } });
  return { ok: true, message: `${ip}의 네이버 광고노출 제한을 해제했습니다.`, source: null };
}

/** 네이버 목록과 ERP 표시를 비교한다. 읽기만 하고 아무것도 고치지 않는다. log=false 면 감사 로그도 남기지 않는다(등록 창의 사용량 표시용) */
export async function naverBlockStatusFlow(
  input: { adminName: string; log?: boolean },
  api: NaverApi,
  db: BlockDb
): Promise<{ ok: true; status: NaverBlockStatus } | { ok: false; message: string }> {
  let list: NaverExclusion[];
  let erp: { ip: string; source: NaverSource | null }[];
  const log = (entry: BlockLogEntry) => (input.log === false ? Promise.resolve() : safeLog(db, entry));
  try {
    list = await api.list();
    erp = await db.listErpBlocked();
  } catch (e) {
    await log({ ip: null, action: "sync", result: "fail", detail: { admin: input.adminName, error: errorDetail(e) } });
    return { ok: false, message: e instanceof NaverSaError ? e.message : "ERP 표시를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const erpIps = new Set(erp.map((m) => m.ip));
  const cg = list.filter((x) => isCgMemo(x.memo));
  const status: NaverBlockStatus = {
    total: list.length,
    limit: NAVER_SLOT_LIMIT,
    erpLimit: ERP_SLOT_LIMIT,
    cgCount: cg.length,
    missingInNaver: erp.filter((m) => {
      const found = findExclusion(list, m.ip);
      return !found.exact && !found.wildcard;
    }),
    missingInErp: cg.filter((x) => !erpIps.has(x.filterIp)).map((x) => ({ ip: x.filterIp, filterId: x.ipFilterId, memo: x.memo })),
  };
  await log({
    ip: null,
    action: "sync",
    result: "success",
    detail: { admin: input.adminName, total: status.total, cg: status.cgCount, missing_in_naver: status.missingInNaver.length, missing_in_erp: status.missingInErp.length },
  });
  return { ok: true, status };
}
