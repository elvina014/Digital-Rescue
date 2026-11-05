// Click Guard 단위 테스트 — `npm test` (node --test, Node 24 TypeScript 타입 제거 실행)
// 대상 모듈은 다른 모듈을 import 하지 않으므로 Node에서 .ts를 직접 불러온다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractClientIp, ipInCidr, ipPrefix, parseIp, formatIp } from "../../src/lib/click-guard/ip.ts";
import { CLOUDFLARE_IP_RANGES } from "../../src/lib/click-guard/cloudflare-ips.ts";
import { buildClickKey, CLICK_BUCKET_MS, deviceTypeOf, isBotUserAgent } from "../../src/lib/click-guard/visit.ts";
import { isNaverAdLanding } from "../../src/lib/naver-ad/isNaverAdLanding.ts";

const headersOf = (obj) => (name) => obj[name] ?? null;
const extract = (obj) => extractClientIp(headersOf(obj), CLOUDFLARE_IP_RANGES);

// ---------- IP 추출 ----------
test("x-real-ip 를 방문자 IP로 쓴다", () => {
  const r = extract({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1, 10.0.0.1" });
  assert.equal(r.clientIp, "203.0.113.7");
  assert.equal(r.ipVersion, 4);
  assert.equal(r.ipPrefix, "203.0.113.0/24");
});

test("x-real-ip 가 없거나 형식이 틀리면 x-forwarded-for 첫 값", () => {
  assert.equal(extract({ "x-forwarded-for": " 198.51.100.9 , 10.0.0.1" }).clientIp, "198.51.100.9");
  assert.equal(extract({ "x-real-ip": "garbage", "x-forwarded-for": "198.51.100.9" }).clientIp, "198.51.100.9");
});

test("IP 헤더가 전혀 없으면 null", () => {
  const r = extract({});
  assert.deepEqual([r.clientIp, r.ipVersion, r.ipPrefix], [null, null, null]);
});

test("원본 IP 헤더 3종만 그대로 저장", () => {
  const r = extract({ "x-real-ip": "203.0.113.7", "cf-connecting-ip": "1.2.3.4", "user-agent": "x" });
  assert.deepEqual(r.rawHeaders, { "x-real-ip": "203.0.113.7", "cf-connecting-ip": "1.2.3.4" });
});

// ---------- Cloudflare 대역 / 위조 헤더 ----------
test("위조: edge IP가 Cloudflare 대역이 아니면 cf-connecting-ip 를 무시", () => {
  const r = extract({ "x-real-ip": "203.0.113.7", "cf-connecting-ip": "8.8.8.8" });
  assert.equal(r.clientIp, "203.0.113.7");
});

test("edge IP가 Cloudflare IPv4 대역이면 cf-connecting-ip 를 쓴다", () => {
  const r = extract({ "x-real-ip": "104.16.1.1", "cf-connecting-ip": "203.0.113.50" });
  assert.equal(r.clientIp, "203.0.113.50");
});

test("edge IP가 Cloudflare IPv6 대역이면 cf-connecting-ip 를 쓴다", () => {
  const r = extract({ "x-real-ip": "2606:4700:10::6816:1", "cf-connecting-ip": "2001:db8::1" });
  assert.equal(r.clientIp, "2001:db8::1");
  assert.equal(r.ipPrefix, "2001:db8::/64");
});

test("Cloudflare 대역이어도 cf-connecting-ip 가 틀린 형식이면 edge IP 유지", () => {
  assert.equal(extract({ "x-real-ip": "104.16.1.1", "cf-connecting-ip": "not-ip" }).clientIp, "104.16.1.1");
});

test("x-forwarded-for 첫 값을 Cloudflare IP로 위조해도 x-real-ip 가 우선", () => {
  const r = extract({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "104.16.1.1", "cf-connecting-ip": "8.8.8.8" });
  assert.equal(r.clientIp, "203.0.113.7");
});

test("ipInCidr 경계값", () => {
  assert.equal(ipInCidr(parseIp("104.23.255.255"), "104.16.0.0/13"), true);
  assert.equal(ipInCidr(parseIp("104.24.0.0"), "104.16.0.0/13"), false);
  assert.equal(ipInCidr(parseIp("2a06:98c7:ffff::1"), "2a06:98c0::/29"), true);
  assert.equal(ipInCidr(parseIp("2a06:98c8::1"), "2a06:98c0::/29"), false);
  assert.equal(ipInCidr(parseIp("104.16.0.1"), "2400:cb00::/32"), false, "버전이 다르면 false");
});

// ---------- IPv6 / prefix ----------
test("IPv6 /64 prefix 와 표준 표기", () => {
  assert.equal(ipPrefix(parseIp("2001:0DB8:85a3:0000:0000:8A2E:0370:7334")), "2001:db8:85a3::/64");
  assert.equal(ipPrefix(parseIp("2001:db8:1:2:3:4:5:6")), "2001:db8:1:2::/64");
  assert.equal(formatIp(parseIp("2001:db8:0:0:1:0:0:1")), "2001:db8::1:0:0:1");
  assert.equal(formatIp(parseIp("::1")), "::1");
  assert.equal(formatIp(parseIp("fe80::1%eth0")), "fe80::1");
  assert.equal(formatIp(parseIp("[2001:db8::5]")), "2001:db8::5");
});

test("IPv4-mapped IPv6 는 IPv4 로 본다", () => {
  const r = extract({ "x-real-ip": "::ffff:203.0.113.7" });
  assert.equal(r.clientIp, "203.0.113.7");
  assert.equal(r.ipVersion, 4);
  assert.equal(r.ipPrefix, "203.0.113.0/24");
});

test("잘못된 IP 형식은 null", () => {
  for (const bad of ["256.1.1.1", "1.2.3", "1:2:3:4:5:6:7:8:9", "2001:db8:::1", "12345::1", "abc", "", "1.2.3.4/24"]) {
    assert.equal(parseIp(bad), null, bad);
  }
});

// ---------- click_key ----------
test("click_key: NaPm 이 있으면 NaPm 원문 (새로고침해도 같다)", () => {
  const a = buildClickKey({ napm: "ct=abc|ci=1", sessionId: "s1", nAd: "nad-1", nowMs: 0 });
  const b = buildClickKey({ napm: "ct=abc|ci=1", sessionId: "s2", nAd: "nad-2", nowMs: 99 * CLICK_BUCKET_MS });
  assert.equal(a, "ct=abc|ci=1");
  assert.equal(a, b);
});

test("click_key: NaPm 이 없으면 세션 + n_ad + 10분 버킷", () => {
  const base = { napm: null, sessionId: "s1", nAd: "nad-1" };
  const t0 = 5 * CLICK_BUCKET_MS;
  assert.equal(buildClickKey({ ...base, nowMs: t0 }), buildClickKey({ ...base, nowMs: t0 + CLICK_BUCKET_MS - 1 }));
  assert.notEqual(buildClickKey({ ...base, nowMs: t0 }), buildClickKey({ ...base, nowMs: t0 + CLICK_BUCKET_MS }));
  assert.notEqual(buildClickKey({ ...base, nowMs: t0 }), buildClickKey({ ...base, sessionId: "s2", nowMs: t0 }));
  assert.notEqual(buildClickKey({ ...base, nowMs: t0 }), buildClickKey({ ...base, nAd: "nad-2", nowMs: t0 }));
  assert.equal(buildClickKey({ ...base, napm: "  ", nowMs: t0 }), buildClickKey({ ...base, nowMs: t0 }), "공백 NaPm 은 없는 것으로");
});

// ---------- 광고 판정 ----------
test("isNaverAdLanding: 5개 파라미터 중 하나라도 있으면 true", () => {
  for (const key of ["NaPm", "n_media", "n_ad", "n_keyword", "n_campaign_type"]) {
    assert.equal(isNaverAdLanding(new URLSearchParams(`${key}=x`)), true, key);
  }
  assert.equal(isNaverAdLanding(new URLSearchParams("n_media=")), true, "값이 비어 있어도 키가 있으면 광고");
});

test("isNaverAdLanding: 광고 파라미터가 없거나 대소문자가 다르면 false", () => {
  assert.equal(isNaverAdLanding(new URLSearchParams("")), false);
  assert.equal(isNaverAdLanding(new URLSearchParams("utm_source=naver&n_query=x&n_rank=1")), false);
  assert.equal(isNaverAdLanding(new URLSearchParams("napm=x&N_AD=y")), false);
});

// ---------- UA ----------
test("봇 UA 판정과 기기 구분", () => {
  assert.equal(isBotUserAgent("Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)"), true);
  assert.equal(isBotUserAgent("Mozilla/5.0 HeadlessChrome/120.0"), true);
  assert.equal(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"), false);
  assert.equal(deviceTypeOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148"), "mobile");
  assert.equal(deviceTypeOf("Mozilla/5.0 (Linux; Android 14; SM-S918N) Mobile Safari/537.36"), "mobile");
  assert.equal(deviceTypeOf("Mozilla/5.0 (Linux; Android 14; SM-X710) Safari/537.36"), "tablet");
  assert.equal(deviceTypeOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0"), "desktop");
});
