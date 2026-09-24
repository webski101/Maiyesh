# Trial Zero — Win Strategy

Research snapshot for SharedNet / SharedOS + recommended product.

---

## What SharedNet actually is

**SharedNet** ([sharednet.ai](https://www.sharednet.ai)) is the agent-only network: persistent **Rooms** where coding agents talk across machines and runtimes (Claude Code, Codex, Cursor, OpenHands, ChatGPT/Claude via MCP, etc.).

Identity stack:

1. **Principal** — the human / account (authority boundary)
2. **Agent** — named tag over that principal’s sessions
3. **Instance** — one live session (`i_…`)

How agents join:

- Guest: invite (`rit_…`) + **three HTTP calls**: `join` → `say` → `wait`
- Account: `sharednet` CLI or remote MCP at `https://www.sharednet.ai/api/mcp`
- Skills: `https://www.sharednet.ai/skill.md` (guest) and full room skill for CLI

Also in the network: **files** (patches/logs that don’t fit a message) and **credits** (`credits`, `redeem`, `pay`) — the Arena’s play money.

Important rule from their own docs: *joining grants no task authority*. SharedNet is the log and the purse, not the permission kernel.

---

## What SharedOS actually is

**SharedOS** ([sharedos.ai](https://sharedos.ai)) is the **deny-by-default permission kernel** for agent turns.

Core doctrine: *A message carries data and one host-bound purpose, never authority.*

What it owns:

- Structured addresses (human / agent / group / service)
- Capability **grants** (who · what resource · what action · purpose · expiry)
- Re-authorization on **every** tool/file call
- Filtered tool discovery (agent can’t see what it can’t use)
- Escalation as a third outcome (allowed / denied / escalated)
- Audit with content-addressed authority sets
- File plane as memory (list/read/snapshot/revoke — not a black-box vector DB)

What the **host** owns: storage, credentials, scheduling, UI, credit accounting.

Deploy shapes for the hackathon:

1. SharedOS runs the model (standard runtime)
2. Your own loop inside the kernel
3. Coding CLI over **`@aicoo/sharedos-mcp`**

“Built on SharedOS” for judges = your product agents’ turns appear in the **SharedOS Cloud audit trail**, with a clear **purpose string** and grant map.

Related map ([full picture](https://www.sharedos.ai/full-picture)):

| Product | Role |
| --- | --- |
| SharedOS | Kernel (permissions) |
| SharedNet | Network (discovery, rooms, pay) |
| Aicoo | Consumer agent product on the same core |
| SharedEval | Eval harness for cross-boundary behavior |

---

## How Trial Zero is actually scored

Humans leave the keyboard. You win by optimizing for **agent customers**, not slides.

| Prize | Who decides | What wins |
| --- | --- | --- |
| Arena Round 1 | Other agents + judge agents | Try it → specific critique → ranking |
| Arena Round 2 (biggest cash) | Market | Most **credits earned** selling your service |
| Best SharedNet collaboration | Organizers | Real multi-agent room work during build |
| Outstanding SharedOS | Organizers | Grant map, escalation, clean audit |
| Promotion | Social | Posts + screenshots |

Hard constraints from the sister Shared OS Arena rules (assume similar for Trial Zero):

- Product must expose **CLI or MCP** with plain-language I/O + price
- Answer a call in **≤ 5 minutes**
- Agent online for whole Arena; try ≥3 others; spend most credits across ≥3 sellers
- No human in the loop during Arena

Organizers themselves say agents pay for mid-task needs they can’t do alone: *research, verification, code review, data lookup, translation, scheduling, long-term memory, negotiation, monitoring*.

---

## What most teams will build (and lose to)

Expect a flood of:

- Generic “multi-agent code review”
- Thin wrappers over an LLM with an MCP wrapper
- Chat bots that demo well to humans but are slow/vague for agents
- Products that need secrets, long setup, or >5 min delivery
- Pretty dashboards with weak callable surface

Agents buying with a 100-credit budget will favor: **tiny input, deterministic-ish output, fast, cheap, useful right now in the Arena room**.

---

## The product to build: **PROBE**

### One-liner

**PROBE** — the agent-native product trial service for SharedNet.

Other agents send you a **service card** (MCP/CLI endpoint + claimed I/O). PROBE runs a **permissioned multi-agent trial** under SharedOS and returns a **structured trial report** in seconds: liveness, schema match, sample call, latency, failure modes, and a score with evidence.

### Why this wins (and is not a clone)

1. **Demand is endogenous to the Arena.** Round 1 forces agents to try and critique ≥3 products. Round 2 forces them to buy. PROBE is the pickaxe in the gold rush — every competing agent needs help evaluating everyone else under time pressure.
2. **Agents will pay for it.** Clear ROI: spend 8–12 credits → get a report they can paste as a “specific disagreement” and use to allocate the rest of their budget.
3. **Showcases SharedOS better than a chatbot.** Real fleet with deny-by-default grants:
   - `probe.scout` — may only call the *target* MCP/HTTP (no write to vault)
   - `probe.schema` — may only read response blobs / schema files
   - `probe.judge` — may only write the report file
   - Escalation when target demands secrets, outbound fan-out, or exceeds ceiling
   - One purpose string, e.g. `purpose: "arena.product_trial"`
4. **SharedNet collaboration story is real.** During the build, run Claude Code + Codex (+ Cursor) in one SharedNet Room: scout writer, grant/kernel owner, MCP surface owner. Submit that Room ID.
5. **Novel for this network.** Not “another code review.” It is the first **agent-to-agent product QA / trial marketplace** for the SharedNet economy itself.

### Callable surface (what you list on the submission)

**MCP + CLI** (ship both; MCP is how most Arena agents will call you).

| Tool | Input | Output | Price |
| --- | --- | --- | --- |
| `probe.trial` | `{ endpoint, transport: mcp\|http\|cli, claims[], sample_input? }` | TrialReport JSON | **10 credits** |
| `probe.batch` | up to 3 endpoints | array of reports | **24 credits** |
| `probe.health` | none | `{ ok, p95_ms }` | **0** (bait) |

Hard SLOs:

- `probe.trial` p95 **&lt; 45s**, hard fail at 90s (never miss the 5-minute Arena cap)
- Always return machine-readable JSON + a 5-line human/agent summary
- Never request caller secrets; never execute unscoped code from the target

### TrialReport shape (designed for agent consumers)

```json
{
  "target": "mcp://…",
  "reachable": true,
  "latency_ms": 842,
  "schema_ok": true,
  "sample": { "in": {}, "out": {}, "ok": true },
  "failures": [],
  "score": 0.81,
  "verdict": "buy_if_price_le_15",
  "disagreements": [
    "Claimed 'sub-second' but p95 was 842ms",
    "Tool list missing advertised `translate` tool"
  ],
  "audit_purpose": "arena.product_trial",
  "receipt_id": "…"
}
```

Those `disagreements[]` lines are literally what Round 1 agents need to post.

### Pricing psychology for Top Earner

- 10 credits → up to ~10 buyers if everyone spends once = strong earner
- Offer free `probe.health` so agents discover you in Round 1
- Bundle `probe.batch` slightly discounted so Round 2 whales buy three trials at once
- Deliver so fast agents call you again mid-round

### SharedOS grant map (Judges / SharedOS track)

```
namespace: probe.arena
purpose:   arena.product_trial

human.owner
  → grant scout:   tools.call(target) [maxUses, expire]
  → grant schema:  files.read(probe/raw/*)
  → grant judge:   files.write(probe/reports/*)
  → deny:          files.read(secrets/*), net.*, pay.*

escalation triggers:
  - target asks for credentials
  - response > size ceiling
  - scout attempts second hop
```

Print this map in the README and make the audit trail visible in SharedOS Cloud.

---

## Build order (48 hours)

### Before hacking opens

1. Register on MentorMates event page
2. Join Discord → get tenant ID + owner address in `#arena-support`
3. Create SharedNet account, mint Room, invite your agents
4. Install `@aicoo/sharedos@next` + `sharednet` CLI
5. Register your personal agent (Claude Code or Codex) as the Arena node

### Day 1 — kernel + callable path

1. Embed SharedOS; prove allow + deny + escalate in audit
2. Implement `probe.scout` / `probe.schema` / `probe.judge` as three agents
3. Expose MCP server (`probe.trial`, `probe.health`)
4. Thin CLI: `npx probe trial <endpoint>`

### Day 2 — product quality + Arena readiness

1. End-to-end: foreign agent pays → calls → gets report &lt; 45s
2. Chaos tests: dead endpoint, slow endpoint, lying schema, secret-seeking target
3. Write agent-facing pitch (one paragraph your Arena agent will paste)
4. Prep Arena agent instructions: try 3+, disagree with evidence, price 10, spam health

### Submission pack

- Project name, contact, team
- Product link + how to call (MCP URL + example tool call)
- SharedNet Room ID used during build
- Few sentences on multi-agent collab
- SharedOS purpose string + agent addresses + where SharedOS is used
- Repo + Discord username

---

## Arena agent playbook (you write this before humans leave)

Your personal agent must:

1. Announce PROBE with MCP URL, price, sample call, SLO
2. Offer free `probe.health` to every room member
3. In Round 1: trial ≥3 rivals (use your own PROBE on them), post 1+ specific disagreement each, submit ranking with PROBE up top *only if deserved*
4. In Round 2: sell hard; also buy 3+ *complementary* services (don’t spend on clones); keep enough credits to rebuy if someone is useful
5. Stay in `wait`/`watch` the whole window — presence matters

---

## Honest confidence

No one can guarantee first place. What you *can* maximize:

| Goal | Fit |
| --- | --- |
| Arena 2 Top Earner ($200) | **Best** — universal mid-round demand |
| Arena 1 Agents’ Choice | **Strong** — agents who *use* you rank you high |
| SharedOS outstanding | **Strong** — real grant map + escalation |
| SharedNet collaboration | **Strong** — multi-runtime room during build |
| Promotion | Separate — post build logs + Room screenshots |

If PROBE feels too meta and you want a backup in the same architecture: **RECEIPT** — bounded long-term memory vault (store/query facts as SharedOS files with TTL + citation receipts). Still good; weaker Arena-endogenous demand than PROBE.

---

## Do not build

- Human-facing SaaS with agents bolted on
- Anything needing OAuth from buyers mid-Arena
- Anything slower than ~1 minute
- Vague “AI coworker” without a single priced tool
- Services that only impress humans on a slide

---

## Next step

Say the word and we scaffold PROBE in this repo: SharedOS host, three-agent grant map, MCP + CLI, mock Arena buyer test, README with call instructions.
