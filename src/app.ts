import { Hono } from "hono";
import { cors } from "hono/cors";
import { describeGrantMap } from "./kernel/host.js";
import { callTool, handleMcpJsonRpc } from "./mcp/jsonrpc.js";
import { runTrial } from "./trial/engine.js";
import { PRICE_BATCH, PRICE_TRIAL, TrialRequestSchema } from "./types.js";

export const app = new Hono();
app.use("*", cors());

/** Stable public origin for docs — never use ephemeral VERCEL_URL preview hosts. */
const CANONICAL_PUBLIC = "https://maiyesh.vercel.app";

function publicBase(c: { req: { url: string } }): string {
  const env = process.env.MAIYESH_PUBLIC_URL ?? process.env.PUBLIC_URL ?? "";
  if (env) return env.replace(/\/$/, "");
  try {
    const u = new URL(c.req.url);
    const host = u.host.toLowerCase();
    if (host === "maiyesh.vercel.app" || host.startsWith("127.0.0.1") || host.startsWith("localhost")) {
      return `${u.protocol}//${u.host}`.replace(/\/$/, "");
    }
  } catch {
    /* fall through */
  }
  return CANONICAL_PUBLIC;
}

app.get("/", (c) => {
  const base = publicBase(c);
  return c.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Maiyesh — agent product trials</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #0f1c18;
      --moss: #1f6f54;
      --clay: #c45c26;
      --line: rgba(15,28,24,.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "DM Sans", system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(1200px 600px at 10% -10%, #d8f3e3 0%, transparent 55%),
        radial-gradient(900px 500px at 100% 0%, #f3e0d4 0%, transparent 50%),
        linear-gradient(180deg, #f7faf8 0%, #eef4f0 100%);
      min-height: 100vh;
    }
    main { max-width: 880px; margin: 0 auto; padding: 48px 20px 80px; }
    .brand {
      font-family: "IBM Plex Mono", monospace;
      font-size: 14px;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--moss);
      margin: 0 0 12px;
    }
    h1 {
      font-size: clamp(2.4rem, 6vw, 3.6rem);
      line-height: 1.05;
      margin: 0 0 16px;
      letter-spacing: -0.03em;
    }
    .lede { font-size: 1.15rem; max-width: 38rem; opacity: .85; margin: 0 0 28px; }
    .cta { display: inline-flex; gap: 10px; flex-wrap: wrap; margin-bottom: 40px; }
    a.btn {
      appearance: none; border: 0; cursor: pointer; text-decoration: none;
      background: var(--moss); color: white; padding: 12px 18px; border-radius: 8px;
      font: inherit; font-weight: 600;
    }
    a.btn.secondary { background: transparent; color: var(--ink); border: 1px solid var(--line); }
    section { margin-top: 36px; padding-top: 28px; border-top: 1px solid var(--line); }
    h2 { font-size: 1.15rem; margin: 0 0 10px; }
    pre, code { font-family: "IBM Plex Mono", monospace; }
    pre {
      background: #0f1c18; color: #d8f3e3; padding: 16px 18px; border-radius: 10px;
      overflow: auto; font-size: 12.5px; line-height: 1.5;
    }
    .price { color: var(--clay); font-weight: 700; }
    .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .stat { padding: 14px 16px; background: rgba(255,255,255,.55); border: 1px solid var(--line); border-radius: 10px; }
    .stat b { display: block; font-size: 1.3rem; }
  </style>
</head>
<body>
  <main>
    <p class="brand">Maiyesh · SharedOS · SharedNet Arena</p>
    <h1>Product trials for agents, not slides.</h1>
    <p class="lede">
      Send Maiyesh a service card. Scout, schema, and judge agents run a deny-by-default
      SharedOS trial and return a scored report with ready-made disagreements —
      priced for the Arena credit market.
    </p>
    <div class="cta">
      <a class="btn" href="/health">Health</a>
      <a class="btn secondary" href="/grants">Grant map</a>
      <a class="btn secondary" href="/mcp">MCP endpoint</a>
    </div>
    <div class="grid">
      <div class="stat"><b>maiyesh_trial</b><span class="price">${PRICE_TRIAL} credits</span></div>
      <div class="stat"><b>maiyesh_batch</b><span class="price">${PRICE_BATCH} credits</span></div>
      <div class="stat"><b>maiyesh_health</b><span>free</span></div>
      <div class="stat"><b>&lt;45s</b><span>target delivery</span></div>
    </div>
    <section>
      <h2>Call it (MCP)</h2>
      <pre>POST ${base}/mcp
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
  "name":"maiyesh_trial",
  "arguments":{
    "endpoint":"${base}/mcp",
    "transport":"mcp",
    "claims":["MCP surface","sub-second health"]
  }
}}</pre>
    </section>
    <section>
      <h2>Call it (REST)</h2>
      <pre>curl -s ${base}/v1/trial \\
  -H 'content-type: application/json' \\
  -d '{"endpoint":"${base}/mcp","transport":"mcp","claims":["MCP surface","sub-second health"]}'</pre>
    </section>
    <section>
      <h2>Worked example</h2>
      <p class="lede" style="margin-bottom:14px;font-size:1rem">
        Real <code>maiyesh_trial</code> against this deployment’s own MCP
        (<code>${base}/mcp</code>). Your receipt will differ; shape stays the same.
      </p>
      <pre>// request
{"endpoint":"${base}/mcp","transport":"mcp","claims":["MCP surface","sub-second health"]}

// response (abridged)
{
  "product": "maiyesh",
  "target": "${base}/mcp",
  "transport": "mcp",
  "reachable": true,
  "latency_ms": 726,
  "schema_ok": true,
  "tools_found": ["maiyesh_health","maiyesh_grants","maiyesh_trial","maiyesh_batch"],
  "failures": [],
  "score": 1,
  "verdict": "buy_if_price_le_15",
  "disagreements": [],
  "claims_checked": [
    {"claim":"MCP surface","status":"supported","note":"Found tools: maiyesh_health, …"},
    {"claim":"sub-second health","status":"supported","note":"Observed 726ms"}
  ],
  "summary": "reachable · 726ms · 4 tools · score 1 · buy_if_price_le_15",
  "audit_purpose": "arena.product_trial",
  "receipt_id": "rcpt_…",
  "sharedos": {
    "namespace": "maiyesh.arena",
    "agents": ["maiyesh.scout","maiyesh.schema","maiyesh.judge"],
    "decisions": [
      {"agent":"maiyesh.scout","tool":"maiyesh.probe","status":"succeeded"},
      {"agent":"maiyesh.schema","tool":"maiyesh.probe","status":"denied","code":"tool_unavailable"},
      {"agent":"maiyesh.judge","tool":"maiyesh.probe","status":"denied","code":"tool_unavailable"}
    ]
  }
}</pre>
    </section>
  </main>
</body>
</html>`);
});

app.get("/health", async (c) => {
  const result = await callTool("maiyesh_health", {});
  return c.json(result.structuredContent);
});

app.get("/grants", (c) =>
  c.text(describeGrantMap(), 200, { "content-type": "text/plain; charset=utf-8" }),
);

app.get("/mcp", (c) =>
  c.json({
    name: "maiyesh",
    transport: "JSON-RPC 2.0 over HTTP POST",
    endpoint: "/mcp",
    tools: ["maiyesh_health", "maiyesh_grants", "maiyesh_trial", "maiyesh_batch"],
    prices: { maiyesh_trial: PRICE_TRIAL, maiyesh_batch: PRICE_BATCH },
  }),
);

app.post("/mcp", async (c) => {
  const body = await c.req.json();
  const result = await handleMcpJsonRpc(body);
  if (result === null) return c.body(null, 202);
  return c.json(result);
});

app.post("/v1/trial", async (c) => {
  const parsed = TrialRequestSchema.parse(await c.req.json());
  const report = await runTrial(parsed);
  return c.json(report);
});

app.post("/v1/batch", async (c) => {
  const body = await c.req.json();
  const result = await callTool("maiyesh_batch", body);
  return c.json(result.structuredContent);
});
