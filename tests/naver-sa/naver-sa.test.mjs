// 네이버 검색광고 API(광고노출 제한 IP) 단위·모킹 테스트 — `npm test`
// 실제 네이버 API는 호출하지 않는다. fetch 와 DB 는 전부 가짜로 넣는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildAuthHeaders,
  buildNaverMemo,
  buildSignature,
  classifyNaverError,
  createNaverApi,
  findExclusion,
  isCgMemo,
  naverBlockStatusFlow,
  NaverSaError,
  parseExclusionList,
  registerNaverBlockFlow,
  unregisterNaverBlockFlow,
} from "../../src/lib/naver-sa/core.ts";

const CRED = { apiKey: "test-api-key", secretKey: "test-secret", customerId: "338047" };
const NOW = new Date("2026-11-11T03:00:00Z"); // KST 2026-11-11 12:00

// ---------- 서명 ----------
test("서명: timestamp.METHOD.path 를 HMAC-SHA256 → Base64 (독립 계산과 일치)", () => {
  // 문서 예시(1457082455307.GET./ncc/campaigns)의 서명 대상 문자열. 문서에는 비밀키가 없어 정답값 대신 규칙을 검증한다
  const expected = createHmac("sha256", "test-secret").update("1457082455307.GET./ncc/campaigns").digest("base64");
  assert.equal(buildSignature("1457082455307", "GET", "/ncc/campaigns", "test-secret"), expected);
  assert.equal(buildSignature("1457082455307", "get", "/ncc/campaigns", "test-secret"), expected, "METHOD는 대문자로");
  assert.equal(Buffer.from(expected, "base64").length, 32, "SHA-256 = 32바이트");
  assert.notEqual(buildSignature("1457082455307", "GET", "/ncc/campaigns?ids=1", "test-secret"), expected, "쿼리스트링을 넣으면 다른 서명");
});

test("인증 헤더 4종", () => {
  const h = buildAuthHeaders(CRED, "DELETE", "/tool/ip-exclusions/77", "1700000000000");
  assert.equal(h["X-Timestamp"], "1700000000000");
  assert.equal(h["X-API-KEY"], "test-api-key");
  assert.equal(h["X-Customer"], "338047");
  assert.equal(h["X-Signature"], buildSignature("1700000000000", "DELETE", "/tool/ip-exclusions/77", "test-secret"));
});

// ---------- 메모·목록 ----------
test("네이버 메모: [CG] YYMMDD + 메모 앞부분, 25자 이내, 날짜는 한국시간", () => {
  assert.equal(buildNaverMemo("반복 클릭", NOW), "[CG] 261111 반복 클릭");
  const long = buildNaverMemo("일이삼사오육칠팔구십일이삼사오육칠팔구십", NOW);
  assert.equal(long, "[CG] 261111 일이삼사오육칠팔구십일이삼");
  assert.equal(Array.from(long).length, 25);
  assert.equal(buildNaverMemo("  ", NOW), "[CG] 261111");
  assert.equal(buildNaverMemo("x", new Date("2026-11-10T15:30:00Z")), "[CG] 261111 x", "UTC 15:30 = KST 다음 날 00:30");
  assert.ok(isCgMemo("[CG] 261111 x"));
  assert.ok(!isCgMemo("사무실 차단") && !isCgMemo(null));
});

test("목록 파싱과 IP 찾기 (정확히 일치 / 와일드카드)", () => {
  const list = parseExclusionList([
    { ipFilterId: 11, filterIp: "1.2.3.4", memo: "[CG] 261111 a", regTm: "2026-11-11T00:00:00Z" },
    { ipFilterId: "12", filterIp: "5.6.7.*", memo: "직접" },
    { filterIp: "9.9.9.9" },
    "junk",
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].ipFilterId, "11");
  assert.equal(findExclusion(list, "1.2.3.4").exact?.ipFilterId, "11");
  assert.equal(findExclusion(list, "5.6.7.200").wildcard?.ipFilterId, "12");
  assert.equal(findExclusion(list, "5.6.8.1").wildcard, null);
  assert.deepEqual(parseExclusionList({ error: true }), []);
});

test("오류 분류: 공식 오류 코드와 HTTP 상태", () => {
  assert.equal(classifyNaverError(400, { code: 5503 }).kind, "duplicate");
  assert.equal(classifyNaverError(400, { code: 5502 }).kind, "memo");
  assert.equal(classifyNaverError(400, { code: 1014 }).kind, "limit");
  assert.equal(classifyNaverError(429, null).kind, "rate");
  assert.equal(classifyNaverError(403, "not json").kind, "auth");
  assert.equal(classifyNaverError(401, {}).kind, "auth");
  assert.equal(classifyNaverError(503, null).kind, "maintenance");
  assert.equal(classifyNaverError(500, null).kind, "unknown");
});

// ---------- API 호출 (가짜 fetch) ----------
function fakeFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ...init });
    return handler(url, init);
  };
  return { fetchImpl, calls };
}
const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => (body === undefined ? "" : JSON.stringify(body)) });

test("API: 목록 GET — 주소·서명·헤더", async () => {
  const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, [{ ipFilterId: 1, filterIp: "1.1.1.1", memo: null }]));
  const api = createNaverApi({ credentials: CRED, fetchImpl, now: () => 1700000000000 });
  const list = await api.list();
  assert.equal(list.length, 1);
  assert.equal(calls[0].url, "https://api.searchad.naver.com/tool/ip-exclusions");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].headers["X-Signature"], buildSignature("1700000000000", "GET", "/tool/ip-exclusions", "test-secret"));
  assert.equal(calls[0].body, undefined);
});

test("API: 등록 POST 본문은 filterIp·memo, 삭제는 경로에 ID", async () => {
  const { fetchImpl, calls } = fakeFetch((url, init) =>
    init.method === "POST" ? jsonResponse(200, { ipFilterId: 900, filterIp: "2.2.2.2", memo: "[CG] 261111 m" }) : jsonResponse(204)
  );
  const api = createNaverApi({ credentials: CRED, fetchImpl, now: () => 1 });
  const created = await api.create("2.2.2.2", "[CG] 261111 m");
  assert.equal(created.ipFilterId, "900");
  assert.deepEqual(JSON.parse(calls[0].body), { filterIp: "2.2.2.2", memo: "[CG] 261111 m" });
  await api.remove("900");
  assert.equal(calls[1].url, "https://api.searchad.naver.com/tool/ip-exclusions/900");
  assert.equal(calls[1].headers["X-Signature"], buildSignature("1", "DELETE", "/tool/ip-exclusions/900", "test-secret"));
});

test("API: 키가 없으면 네이버를 호출하지 않고 config 오류", async () => {
  const { fetchImpl, calls } = fakeFetch(() => jsonResponse(200, []));
  const api = createNaverApi({ credentials: null, fetchImpl });
  await assert.rejects(api.list(), (e) => e instanceof NaverSaError && e.kind === "config");
  assert.equal(calls.length, 0);
});

test("API: 타임아웃·네트워크 오류·인증 실패를 한국어 오류로 변환", async () => {
  const timeout = createNaverApi({
    credentials: CRED,
    timeoutMs: 20,
    fetchImpl: (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))),
  });
  await assert.rejects(timeout.list(), (e) => e.kind === "timeout" && /지연/.test(e.message));

  const network = createNaverApi({
    credentials: CRED,
    fetchImpl: async () => {
      throw new TypeError("fetch failed");
    },
  });
  await assert.rejects(network.list(), (e) => e.kind === "network");

  const auth = createNaverApi({ credentials: CRED, fetchImpl: async () => jsonResponse(403, { code: 1018, title: "Forbidden" }) });
  await assert.rejects(auth.list(), (e) => e.kind === "auth" && e.status === 403 && e.code === 1018 && /인증/.test(e.message));
});

// ---------- 등록/해제/현황 흐름 (가짜 API + 가짜 DB) ----------
function fakeDb({ whitelisted = [], marks = {}, failMark = false } = {}) {
  const state = { marks: { ...marks }, logs: [], writes: 0 };
  return {
    state,
    isWhitelisted: async (ip) => whitelisted.includes(ip),
    markRegistered: async (ip, filterId, memo, source) => {
      if (failMark) throw new Error("db down");
      state.writes += 1;
      state.marks[ip] = { filterId, memo, source };
    },
    markUnregistered: async (ip) => {
      if (failMark) throw new Error("db down");
      state.writes += 1;
      delete state.marks[ip];
    },
    listErpBlocked: async () => Object.entries(state.marks).map(([ip, m]) => ({ ip, source: m.source })),
    log: async (entry) => {
      state.logs.push(entry);
    },
  };
}
function fakeApi(list, { failList = null, failCreate = null, failRemove = null } = {}) {
  const state = { list: [...list], created: [], removed: [] };
  return {
    state,
    list: async () => {
      if (failList) throw failList;
      return state.list;
    },
    create: async (ip, memo) => {
      if (failCreate) throw failCreate;
      const item = { ipFilterId: String(1000 + state.created.length), filterIp: ip, memo, regTm: null };
      state.created.push(item);
      state.list.push(item);
      return item;
    },
    remove: async (id) => {
      if (failRemove) throw failRemove;
      state.removed.push(id);
      state.list = state.list.filter((x) => x.ipFilterId !== id);
    },
  };
}
const input = (ip, memo = "반복 클릭") => ({ ip, memo, adminName: "테스트관리자", now: NOW });
const lastLog = (db) => db.state.logs.at(-1);

test("등록 성공: 네이버 등록 → ERP 기록 → 로그", async () => {
  const api = fakeApi([{ ipFilterId: "1", filterIp: "9.9.9.9", memo: "직접" }]);
  const db = fakeDb();
  const res = await registerNaverBlockFlow(input("1.2.3.4"), api, db);
  assert.equal(res.ok, true);
  assert.equal(res.source, "api");
  assert.deepEqual(
    api.state.created.map((c) => [c.filterIp, c.memo]),
    [["1.2.3.4", "[CG] 261111 반복 클릭"]]
  );
  assert.deepEqual(db.state.marks["1.2.3.4"], { filterId: "1000", memo: "반복 클릭", source: "api" });
  assert.equal(lastLog(db).result, "success");
  assert.equal(lastLog(db).detail.admin, "테스트관리자");
});

test("이미 [CG]로 등록된 IP: 새로 등록하지 않고 ERP만 맞춤(skipped)", async () => {
  const api = fakeApi([{ ipFilterId: "55", filterIp: "1.2.3.4", memo: "[CG] 261101 이전" }]);
  const db = fakeDb();
  const res = await registerNaverBlockFlow(input("1.2.3.4"), api, db);
  assert.equal(res.ok, true);
  assert.equal(api.state.created.length, 0);
  assert.deepEqual(db.state.marks["1.2.3.4"], { filterId: "55", memo: "반복 클릭", source: "api" });
  assert.equal(lastLog(db).result, "skipped");
  assert.equal(lastLog(db).detail.reason, "already_cg");
});

test("수동 등록분: 새로 등록하지 않고 manual 로 표시", async () => {
  const api = fakeApi([{ ipFilterId: "56", filterIp: "1.2.3.4", memo: "사무실 직접 등록" }]);
  const db = fakeDb();
  const res = await registerNaverBlockFlow(input("1.2.3.4"), api, db);
  assert.equal(res.ok, true);
  assert.equal(res.source, "manual");
  assert.equal(api.state.created.length, 0);
  assert.equal(db.state.marks["1.2.3.4"].source, "manual");
  assert.equal(lastLog(db).detail.reason, "already_manual");
});

test("수동 와일드카드 대역에 포함: 등록하지 않고 manual 로 표시", async () => {
  const api = fakeApi([{ ipFilterId: "57", filterIp: "1.2.3.*", memo: "대역" }]);
  const db = fakeDb();
  const res = await registerNaverBlockFlow(input("1.2.3.4"), api, db);
  assert.equal(res.ok, true);
  assert.equal(api.state.created.length, 0);
  assert.deepEqual(db.state.marks["1.2.3.4"], { filterId: null, memo: "반복 클릭", source: "manual" });
  assert.equal(lastLog(db).detail.reason, "covered_by_wildcard");
});

test("슬롯 부족(500개 이상): 거부, 네이버·DB 변경 없음", async () => {
  const full = Array.from({ length: 500 }, (_, i) => ({ ipFilterId: String(i), filterIp: `10.0.${Math.floor(i / 250)}.${i % 250}`, memo: "x" }));
  const api = fakeApi(full);
  const db = fakeDb();
  const res = await registerNaverBlockFlow(input("1.2.3.4"), api, db);
  assert.equal(res.ok, false);
  assert.match(res.message, /슬롯 부족/);
  assert.equal(api.state.created.length, 0);
  assert.equal(db.state.writes, 0);
  assert.equal(lastLog(db).result, "fail");
  assert.equal(lastLog(db).detail.reason, "slot_full");
});

test("네트워크 타임아웃·인증 실패: DB가 바뀌지 않고 실패 로그만 남는다", async () => {
  for (const [error, pattern] of [
    [new NaverSaError("timeout"), /지연/],
    [new NaverSaError("auth", { status: 403, code: 1018 }), /인증/],
  ]) {
    // 목록 조회 단계에서 실패
    let db = fakeDb();
    let res = await registerNaverBlockFlow(input("1.2.3.4"), fakeApi([], { failList: error }), db);
    assert.equal(res.ok, false);
    assert.match(res.message, pattern);
    assert.equal(db.state.writes, 0);
    assert.equal(lastLog(db).result, "fail");
    // 등록 단계에서 실패
    db = fakeDb();
    res = await registerNaverBlockFlow(input("1.2.3.4"), fakeApi([], { failCreate: error }), db);
    assert.equal(res.ok, false);
    assert.equal(db.state.writes, 0);
    assert.deepEqual(db.state.marks, {});
    assert.equal(lastLog(db).detail.step, "create");
  }
});

test("화이트리스트 IP·IPv6·빈 메모는 네이버를 호출하지 않고 거부", async () => {
  const api = fakeApi([]);
  const db = fakeDb({ whitelisted: ["1.2.3.4"] });
  let res = await registerNaverBlockFlow(input("1.2.3.4"), api, db);
  assert.equal(res.ok, false);
  assert.match(res.message, /화이트리스트/);
  res = await registerNaverBlockFlow(input("2001:db8::1"), api, db);
  assert.match(res.message, /IPv4만/);
  res = await registerNaverBlockFlow(input("5.5.5.5", "   "), api, db);
  assert.match(res.message, /메모/);
  assert.equal(api.state.created.length, 0);
  assert.equal(db.state.writes, 0);
});

test("네이버 등록은 됐는데 ERP 기록 실패: 오류 반환 + 로그, 다시 누르면 맞춰진다", async () => {
  const api = fakeApi([]);
  const broken = fakeDb({ failMark: true });
  const res = await registerNaverBlockFlow(input("1.2.3.4"), api, broken);
  assert.equal(res.ok, false);
  assert.match(res.message, /네이버에는 등록됐지만/);
  assert.equal(lastLog(broken).detail.step, "mark_after_create");
  assert.equal(lastLog(broken).filterId, "1000");
  // 다시 시도: 이미 [CG]로 있으므로 새로 등록하지 않고 ERP만 맞춘다
  const db = fakeDb();
  const retry = await registerNaverBlockFlow(input("1.2.3.4"), api, db);
  assert.equal(retry.ok, true);
  assert.equal(api.state.created.length, 1);
  assert.equal(db.state.marks["1.2.3.4"].filterId, "1000");
});

test("해제: [CG] 항목만 삭제, 수동 항목은 거부", async () => {
  const api = fakeApi([
    { ipFilterId: "70", filterIp: "1.2.3.4", memo: "[CG] 261111 a" },
    { ipFilterId: "71", filterIp: "5.6.7.8", memo: "직접 등록" },
  ]);
  const db = fakeDb({ marks: { "1.2.3.4": { source: "api" }, "5.6.7.8": { source: "manual" } } });
  let res = await unregisterNaverBlockFlow({ ip: "5.6.7.8", adminName: "a" }, api, db);
  assert.equal(res.ok, false);
  assert.equal(res.message, "네이버에서 직접 등록한 항목이라 ERP에서 해제할 수 없습니다.");
  assert.deepEqual(api.state.removed, []);
  assert.ok(db.state.marks["5.6.7.8"]);

  res = await unregisterNaverBlockFlow({ ip: "1.2.3.4", adminName: "a" }, api, db);
  assert.equal(res.ok, true);
  assert.deepEqual(api.state.removed, ["70"]);
  assert.equal(db.state.marks["1.2.3.4"], undefined);
  assert.equal(lastLog(db).result, "success");
});

test("해제 실패(타임아웃): DB가 바뀌지 않는다 / 네이버에 없으면 ERP 표시만 해제", async () => {
  const marks = { "1.2.3.4": { source: "api" } };
  let db = fakeDb({ marks });
  let res = await unregisterNaverBlockFlow(
    { ip: "1.2.3.4", adminName: "a" },
    fakeApi([{ ipFilterId: "70", filterIp: "1.2.3.4", memo: "[CG] x" }], { failRemove: new NaverSaError("timeout") }),
    db
  );
  assert.equal(res.ok, false);
  assert.equal(db.state.writes, 0);
  assert.ok(db.state.marks["1.2.3.4"]);

  db = fakeDb({ marks });
  res = await unregisterNaverBlockFlow({ ip: "1.2.3.4", adminName: "a" }, fakeApi([]), db);
  assert.equal(res.ok, true);
  assert.equal(db.state.marks["1.2.3.4"], undefined);
  assert.equal(lastLog(db).result, "skipped");
});

test("현황: 사용량과 불일치 목록만 돌려주고 아무것도 고치지 않는다", async () => {
  const api = fakeApi([
    { ipFilterId: "1", filterIp: "1.1.1.1", memo: "[CG] 261111 a" },
    { ipFilterId: "2", filterIp: "2.2.2.2", memo: "[CG] 261111 b" },
    { ipFilterId: "3", filterIp: "3.3.3.*", memo: "직접 대역" },
  ]);
  const db = fakeDb({ marks: { "1.1.1.1": { source: "api" }, "3.3.3.9": { source: "manual" }, "4.4.4.4": { source: "api" } } });
  const res = await naverBlockStatusFlow({ adminName: "a" }, api, db);
  assert.equal(res.ok, true);
  assert.equal(res.status.total, 3);
  assert.equal(res.status.limit, 600);
  assert.equal(res.status.cgCount, 2);
  assert.deepEqual(res.status.missingInNaver, [{ ip: "4.4.4.4", source: "api" }]);
  assert.deepEqual(res.status.missingInErp, [{ ip: "2.2.2.2", filterId: "2", memo: "[CG] 261111 b" }]);
  assert.equal(db.state.writes, 0);
  assert.equal(api.state.created.length + api.state.removed.length, 0);
  assert.equal(lastLog(db).action, "sync");

  const failed = await naverBlockStatusFlow({ adminName: "a" }, fakeApi([], { failList: new NaverSaError("auth") }), fakeDb());
  assert.equal(failed.ok, false);
});
