// Phase 9 — fake OpenRouter chat/completions for the optional local n8n container test (LOCAL TESTS ONLY).
// The repo workflow JSON is NOT changed: only a scratch copy points its HTTP node at this stub.
// Run:  node supabase/test-fixtures/phase9/openrouter-stub.mjs        (port 5680, all interfaces so the container can reach it)
// Mode: curl -X POST http://127.0.0.1:5680/__mode/<ok|fenced|bad|500>
// Last: curl http://127.0.0.1:5680/__last   → what n8n sent (model, auth header present, message shape; no image bytes)
import http from "node:http";

const PORT = Number(process.env.STUB_PORT ?? 5680);
let mode = "ok";
let last = null;

const CONTENT = JSON.stringify({
  readings: [
    { text: "8T5 BQ780S", type: "MARKING", confidence: 0.82, note: "칩 윗면" },
    { text: "LA-K201P", type: "WRONGTYPE", confidence: 7, note: "" },
    { text: "", type: "OTHER", confidence: 0.1 },
    ...Array.from({ length: 12 }, (_, i) => ({ text: `R${i}`, type: "OTHER", confidence: 0.3 })),
  ],
});

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url.startsWith("/__mode/")) {
      mode = req.url.slice("/__mode/".length);
      return send(res, 200, { mode });
    }
    if (req.method === "GET" && req.url === "/__last") return send(res, 200, last ?? {});
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let body = {};
      try {
        body = JSON.parse(raw);
      } catch {
        /* recorded below */
      }
      const user = body.messages?.find((m) => m.role === "user");
      last = {
        path: req.url,
        authorization_present: Boolean(req.headers.authorization),
        model: body.model,
        response_format: body.response_format,
        temperature: body.temperature,
        user_parts: Array.isArray(user?.content) ? user.content.map((p) => p.type) : null,
        image_prefix: user?.content?.find?.((p) => p.type === "image_url")?.image_url?.url?.slice(0, 23) ?? null,
        mode,
      };
      if (mode === "500") return send(res, 500, { error: { message: "upstream error" } });
      const content = mode === "fenced" ? "```json\n" + CONTENT + "\n```" : mode === "bad" ? "죄송합니다, 읽을 수 없습니다." : CONTENT;
      return send(res, 200, { id: "gen-stub", model: "stub/vision-model", choices: [{ message: { role: "assistant", content } }] });
    });
  })
  .listen(PORT, "0.0.0.0", () => console.log(`openrouter stub on :${PORT} (mode ${mode})`));
