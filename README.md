# Maiyesh

**Permissioned agent-to-agent product trials** for the SharedNet / SharedOS Trial Zero Arena.

Other agents send Maiyesh a service card (MCP / HTTP endpoint + claims). Three SharedOS agents — **scout**, **schema**, **judge** — run a deny-by-default trial and return a scored `TrialReport` with ready-made disagreements for Round 1 and a buy/skip verdict for Round 2.

## Public product URL (Arena)

**Base:** https://maiyesh.vercel.app  
Vercel project: **maiyesh**

| Surface | URL |
| --- | --- |
| Landing | `/` |
| Health | `/health` |
| MCP | `POST /mcp` |
| Trial REST | `POST /v1/trial` |
| Grant map | `/grants` |

MentorMates: paste `https://maiyesh.vercel.app` as the public product link.

## Quick start

```bash
npm install
npm run dev          # http://127.0.0.1:3847
npm test
npx tsx src/cli.ts health
```

## How an agent calls it

Replace `$BASE` with the public URL or `http://127.0.0.1:3847`.

### MCP (preferred)

```bash
# List tools
curl -s $BASE/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# Free health
curl -s $BASE/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"maiyesh_health","arguments":{}}}'

# Paid trial (10 Arena credits)
curl -s $BASE/mcp \
  -H 'content-type: application/json' \
  -d '{
    "jsonrpc":"2.0","id":3,"method":"tools/call",
    "params":{
      "name":"maiyesh_trial",
      "arguments":{
        "endpoint":"https://example.com/mcp",
        "transport":"mcp",
        "claims":["MCP surface","sub-second health"]
      }
    }
  }'
```

### REST

```bash
curl -s $BASE/v1/trial \
  -H 'content-type: application/json' \
  -d '{"endpoint":"https://example.com/mcp","transport":"mcp","claims":["MCP surface"]}'
```

### CLI

```bash
npx tsx src/cli.ts trial --endpoint http://127.0.0.1:3847/mcp --transport mcp --claim "MCP surface"
```

## Pricing (Arena credits)

| Tool | Price |
| --- | --- |
| `maiyesh_health` | free |
| `maiyesh_grants` | free |
| `maiyesh_trial` | **10** |
| `maiyesh_batch` | **24** (up to 3 targets) |

Target delivery: **&lt;45s** (hard Arena cap is 5 minutes).

## SharedOS grant map

Purpose string: `arena.product_trial`  
Namespace: `maiyesh.arena`

```
human.maiyesh-owner
  → maiyesh.scout   · maiyesh.probe + files:maiyesh/raw/* + escalate
  → maiyesh.schema  · files:maiyesh/raw/* (read) · DENIED probe
  → maiyesh.judge   · files:maiyesh/reports/* · DENIED probe
```

See `GET /grants` or `maiyesh grants`.

## Submission notes (Trial Zero)

- **Product name:** Maiyesh
- **Public URL:** https://maiyesh.vercel.app
- **Callable surface:** MCP at `/mcp` + CLI `src/cli.ts` + REST `/v1/trial`
- **SharedNet Room ID:** `rom_KkRUTvEgr5`
- **How agents collaborated:** In Room `rom_KkRUTvEgr5`, agents split Maiyesh work — Cursor owns MCP docs/call surface; other seats take probe engine and SharedOS grants (scout/schema/judge), handing off via Sharednet messages
- **SharedOS usage:** every trial turn runs through `@aicoo/sharedos` with explicit grants; deny decisions for schema/judge probe attempts are part of the receipt

## Stack

- `@aicoo/sharedos` 1.0.0-preview — permission kernel
- Hono HTTP server — product link + MCP JSON-RPC
- TypeScript / Node 22+

## Strategy

See [STRATEGY.md](./STRATEGY.md) for why this product is shaped for Arena Round 1 + Round 2.
