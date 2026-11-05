/**
 * Click Guard — 방문자 IP 추출 (docs/click-guard/SPEC.md "IP")
 *
 * 1) edge IP = x-real-ip (없거나 형식이 틀리면 x-forwarded-for 첫 값). Vercel이 직접 설정하는 값이다.
 * 2) edge IP가 Cloudflare 대역(trustedProxyRanges)일 때만 cf-connecting-ip 를 방문자 IP로 쓴다.
 *    DNS only 상태에서는 cf-connecting-ip 를 방문자가 마음대로 넣을 수 있으므로 믿지 않는다.
 * 3) ip_prefix: IPv4 /24, IPv6 /64.
 *
 * 다른 모듈을 import 하지 않는다 — 단위 테스트(tests/click-guard)가 Node에서 직접 불러온다.
 * Cloudflare 대역은 호출하는 쪽에서 넘긴다 (src/lib/click-guard/cloudflare-ips.ts).
 */

export interface ParsedIp {
  version: 4 | 6;
  /** IPv4 4바이트, IPv6 16바이트 */
  bytes: number[];
}

export interface ClientIpInfo {
  clientIp: string | null;
  ipVersion: 4 | 6 | null;
  ipPrefix: string | null;
  rawHeaders: Record<string, string>;
}

const RAW_HEADER_NAMES = ["x-real-ip", "x-forwarded-for", "cf-connecting-ip"] as const;
const RAW_HEADER_MAX = 500;

function parseIpv4(s: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return null;
  const parts = s.split(".").map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

function parseIpv6(s: string): number[] | null {
  let text = s;
  let tail: number[] = [];
  // 끝부분에 IPv4 표기(::ffff:1.2.3.4)가 붙은 경우
  const lastColon = text.lastIndexOf(":");
  if (lastColon !== -1 && text.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4(text.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    text = text.slice(0, lastColon + 1) + "0:0";
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string) => (part === "" ? [] : part.split(":"));
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  const bytes = groups.flatMap((g) => {
    const n = parseInt(g, 16);
    return [n >> 8, n & 0xff];
  });
  if (tail.length === 4) bytes.splice(12, 4, ...tail);
  return bytes;
}

/** 문자열 → IP. IPv4-mapped IPv6(::ffff:a.b.c.d)는 IPv4로 본다. 형식이 틀리면 null */
export function parseIp(input: string | null | undefined): ParsedIp | null {
  if (!input) return null;
  let s = input.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (!s || s.length > 64) return null;

  const v4 = parseIpv4(s);
  if (v4) return { version: 4, bytes: v4 };
  if (!s.includes(":")) return null;
  const v6 = parseIpv6(s);
  if (!v6) return null;
  const isMapped = v6.slice(0, 10).every((b) => b === 0) && v6[10] === 0xff && v6[11] === 0xff;
  return isMapped ? { version: 4, bytes: v6.slice(12) } : { version: 6, bytes: v6 };
}

/** IP → 표준 문자열 (IPv6는 RFC 5952 축약, 소문자) */
export function formatIp(ip: ParsedIp): string {
  if (ip.version === 4) return ip.bytes.join(".");
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) groups.push((ip.bytes[i] << 8) | ip.bytes[i + 1]);
  // 가장 긴 0 그룹 연속(2개 이상)을 :: 로 줄인다
  let bestStart = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLen) {
      bestStart = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLen < 2) return hex.join(":");
  const left = hex.slice(0, bestStart).join(":");
  const right = hex.slice(bestStart + bestLen).join(":");
  return `${left}::${right}`;
}

function maskBytes(bytes: number[], bits: number): number[] {
  return bytes.map((b, i) => {
    const keep = Math.max(0, Math.min(8, bits - i * 8));
    return keep === 0 ? 0 : b & ((0xff << (8 - keep)) & 0xff);
  });
}

/** CIDR 문자열(예: 104.16.0.0/13) 안에 IP가 있는지 */
export function ipInCidr(ip: ParsedIp, cidr: string): boolean {
  const slash = cidr.indexOf("/");
  if (slash === -1) return false;
  const net = parseIp(cidr.slice(0, slash));
  const bits = Number(cidr.slice(slash + 1));
  if (!net || net.version !== ip.version || !Number.isInteger(bits)) return false;
  if (bits < 0 || bits > ip.bytes.length * 8) return false;
  const a = maskBytes(ip.bytes, bits);
  const b = maskBytes(net.bytes, bits);
  return a.every((v, i) => v === b[i]);
}

/** 대역 문자열: IPv4 /24, IPv6 /64 */
export function ipPrefix(ip: ParsedIp): string {
  const bits = ip.version === 4 ? 24 : 64;
  return `${formatIp({ version: ip.version, bytes: maskBytes(ip.bytes, bits) })}/${bits}`;
}

/** x-forwarded-for 첫 값 */
export function firstForwardedFor(value: string | null | undefined): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

export function extractClientIp(
  getHeader: (name: string) => string | null | undefined,
  trustedProxyRanges: readonly string[]
): ClientIpInfo {
  const rawHeaders: Record<string, string> = {};
  for (const name of RAW_HEADER_NAMES) {
    const value = getHeader(name);
    if (value) rawHeaders[name] = value.slice(0, RAW_HEADER_MAX);
  }

  const edge = parseIp(getHeader("x-real-ip")) ?? parseIp(firstForwardedFor(getHeader("x-forwarded-for")));
  let client = edge;
  if (edge && trustedProxyRanges.some((range) => ipInCidr(edge, range))) {
    const cf = parseIp(getHeader("cf-connecting-ip"));
    if (cf) client = cf;
  }

  if (!client) return { clientIp: null, ipVersion: null, ipPrefix: null, rawHeaders };
  return { clientIp: formatIp(client), ipVersion: client.version, ipPrefix: ipPrefix(client), rawHeaders };
}
