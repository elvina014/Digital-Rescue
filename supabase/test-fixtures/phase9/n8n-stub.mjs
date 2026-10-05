// Phase 9 — local stand-in for the n8n photo-recognition webhook (LOCAL TESTS ONLY; not imported by the app).
// Run:   STUB_SECRET=<value of N8N_RI_PHOTO_SECRET> node supabase/test-fixtures/phase9/n8n-stub.mjs
// App:   N8N_RI_PHOTO_WEBHOOK_URL=http://127.0.0.1:5679/webhook/ri-photo-recognition (temporary .env.development.local)
// Mode:  curl -X POST http://127.0.0.1:5679/__mode/<ok|pii|empty|bad-json|500|slow>   (default ok)
// Last:  curl http://127.0.0.1:5679/__last   → request summary without the image (WebP? EXIF chunk?)
import http from "node:http";

const PORT = Number(process.env.STUB_PORT ?? 5679);
const SECRET = process.env.STUB_SECRET ?? "";
let mode = "ok";
let last = null;

const READINGS = {
  PART: [
    { text: "8T5 BQ780S", type: "MARKING", confidence: 0.82, note: "칩 윗면 마킹" },
    { text: "BQ24780S", type: "PART_NUMBER", confidence: 0.95, note: null },
  ],
  BOARD: [
    { text: "BA41-02345A", type: "BOARD_NUMBER", confidence: 0.8, note: "보드 우측 하단 실크" },
    { text: "NM-D451", type: "BOARD_NUMBER", confidence: 0.7, note: null },
  ],
  DEVICE: [
    { text: "NT950QED-KC71S", type: "MODEL_NUMBER", confidence: 0.9, note: "바닥 라벨 모델명" },
    { text: "15Z90T", type: "MODEL_NUMBER", confidence: 0.6, note: null },
  ],
};

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url.startsWith("/__mode/")) {
      mode = req.url.slice("/__mode/".length);
      return send(res, 200, { mode });
    }
    if (req.method === "GET" && req.url === "/__last") return send(res, 200, last ?? {});
    if (req.method !== "POST") return send(res, 404, { error: "not found" });

    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (!SECRET || req.headers["x-ri-secret"] !== SECRET) return send(res, 403, { error: "Authorization data is wrong!" });
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return send(res, 400, { error: "invalid json" });
      }
      const b64 = String(body.image ?? "").replace(/^data:image\/\w+;base64,/, "");
      const img = Buffer.from(b64, "base64");
      last = {
        request_id: body.request_id,
        photo_kind: body.photo_kind,
        target_label: body.target_label,
        keys: Object.keys(body),
        image_prefix: String(body.image ?? "").slice(0, 23),
        image_bytes: img.length,
        is_webp: img.subarray(0, 4).toString() === "RIFF" && img.subarray(8, 12).toString() === "WEBP",
        has_exif_chunk: img.includes(Buffer.from("EXIF")),
        mode,
      };
      const ok = () => send(res, 200, { readings: READINGS[body.photo_kind] ?? [], model: "stub/vision", execution_id: `stub-${Date.now()}` });
      switch (mode) {
        case "pii":
          return send(res, 200, { readings: [{ text: "010-1234-5678", type: "OTHER", confidence: 0.5, note: null }], model: "stub/vision", execution_id: "stub-pii" });
        case "empty":
          return send(res, 200, { readings: [], model: "stub/vision", execution_id: "stub-empty" });
        case "bad-json":
          return send(res, 200, "this is not json");
        case "500":
          return send(res, 500, { error: "AI 호출 또는 응답 해석에 실패했습니다." });
        case "slow":
          return setTimeout(ok, 60_000);
        default:
          return ok();
      }
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`n8n stub on http://127.0.0.1:${PORT} (mode ${mode})`));
