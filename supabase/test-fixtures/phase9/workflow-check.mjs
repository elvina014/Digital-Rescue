// Phase 9 — structural check of n8n/ri-photo-recognition.workflow.json + its two Code nodes run with mocked n8n inputs (no n8n needed).
// Run from the repo root: node supabase/test-fixtures/phase9/workflow-check.mjs
import { readFileSync } from "node:fs";
import { z } from "zod";
const wf = JSON.parse(readFileSync("n8n/ri-photo-recognition.workflow.json", "utf8"));
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) process.exitCode = 1; };
const names = new Set(wf.nodes.map(n => n.name));
ok(wf.nodes.every(n => ["n8n-nodes-base.webhook","n8n-nodes-base.code","n8n-nodes-base.httpRequest","n8n-nodes-base.respondToWebhook"].includes(n.type)), "only expected node types");
ok(Object.entries(wf.connections).every(([k, v]) => names.has(k) && v.main.flat().every(c => names.has(c.node))), "connections reference existing nodes");
const hook = wf.nodes.find(n => n.type.endsWith("webhook"));
ok(hook.parameters.authentication === "headerAuth" && hook.parameters.responseMode === "responseNode" && hook.parameters.httpMethod === "POST", "webhook: POST, Header Auth, respond via node");
ok(wf.settings.saveDataSuccessExecution === "none" && wf.settings.saveDataErrorExecution === "all" && wf.settings.saveManualExecutions === false, "D7: workflow-level execution saving");
ok(wf.active === false, "imported inactive");
const txt = JSON.stringify(wf);
ok(["<<OPENROUTER_MODEL_ID>>","<<OPENROUTER_CREDENTIAL_ID>>","<<OPENROUTER_CREDENTIAL_NAME>>","<<RI_PHOTO_HEADER_AUTH_CREDENTIAL_ID>>","<<RI_PHOTO_HEADER_AUTH_CREDENTIAL_NAME>>"].every(p => txt.includes(p)), "Q1 placeholders present");
ok(!/sk-or-|Bearer [A-Za-z0-9]{10}|supabase\.co|wnddkgeohcgcidoklrps/.test(txt), "no secrets / project refs");
const code = (name) => wf.nodes.find(n => n.name === name).parameters.jsCode;
const run = (src, input, exec = { id: "123" }) => new Function("$input", "$execution", src)({ first: () => ({ json: input }) }, exec);
// 요청 구성
const img = "data:image/webp;base64,AAAA";
let r = run(code("요청 구성"), { body: { photo_kind: "BOARD", target_label: "LA-K091P", image: img } })[0].json.openrouter;
ok(r.model === "<<OPENROUTER_MODEL_ID>>" && r.temperature === 0 && r.response_format.type === "json_object", "request: model placeholder, temperature 0, json_object");
ok(r.messages[1].content[1].image_url.url === img && r.messages[1].content[0].text.includes("LA-K091P"), "request: image + target hint");
let threw = false; try { run(code("요청 구성"), { body: { photo_kind: "X", image: img } }); } catch { threw = true; } ok(threw, "request: invalid kind → error output (400)");
threw = false; try { run(code("요청 구성"), { body: { photo_kind: "PART", image: "http://x" } }); } catch { threw = true; } ok(threw, "request: non data-URL image → error output (400)");
// 응답 검증
const content = JSON.stringify({ readings: [{ text: " 8T5 BQ780S ", type: "MARKING", confidence: 0.82, note: "칩" }, { text: "LA-K201P", type: "WRONG", confidence: 7, note: "" }, { text: "", type: "OTHER", confidence: 0.1 }, ...Array.from({ length: 12 }, (_, i) => ({ text: "R" + i, type: "OTHER", confidence: "x" }))] });
let out = run(code("응답 검증"), { model: "vendor/model", choices: [{ message: { content } }] }, { id: 77 })[0].json;
ok(out.readings.length === 10, "response: empty text dropped, capped at 10");
ok(JSON.stringify(out.readings[0]) === JSON.stringify({ text: "8T5 BQ780S", type: "MARKING", confidence: 0.82, note: "칩" }), "response: trimmed reading");
ok(out.readings[1].type === "OTHER" && out.readings[1].confidence === 1 && out.readings[1].note === null, "response: bad type → OTHER, confidence clamped, empty note → null");
ok(out.readings[2].confidence === 0, "response: non-number confidence → 0");
ok(out.model === "vendor/model" && out.execution_id === "77", "response: model + execution id");
out = run(code("응답 검증"), { choices: [{ message: { content: "```json\n" + content + "\n```" } }] })[0].json;
ok(out.readings.length === 10, "response: fenced JSON accepted");
threw = false; try { run(code("응답 검증"), { choices: [{ message: { content: "읽을 수 없습니다" } }] }); } catch { threw = true; } ok(threw, "response: non-JSON → error output (502)");
out = run(code("응답 검증"), { choices: [{ message: { content: '{"readings":[]}' } }] })[0].json;
ok(out.readings.length === 0, "response: empty readings pass through (app shows 'no readable number')");
// contract: output satisfies the app's zod schema

const schema = z.object({ readings: z.array(z.object({ text: z.string(), type: z.enum(["PART_NUMBER","MARKING","BOARD_NUMBER","MODEL_NUMBER","OTHER"]), confidence: z.number().min(0).max(1), note: z.string().nullish() })).max(10), model: z.string().nullish(), execution_id: z.union([z.string(), z.number()]).nullish() });
ok(schema.safeParse(run(code("응답 검증"), { model: "m", choices: [{ message: { content } }] })[0].json).success, "contract: workflow output passes the app's response schema");
