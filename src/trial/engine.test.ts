import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMaiyeshHost, schemaAgent, scout, agentContext } from "../kernel/host.js";
import { runTrial } from "../trial/engine.js";
import { handleMcpJsonRpc } from "../mcp/jsonrpc.js";
import { randomUUID } from "node:crypto";

describe("maiyesh SharedOS grants", () => {
  it("allows scout to probe and denies schema", async () => {
    const host = createMaiyeshHost(async () => ({
      reachable: true,
      latency_ms: 12,
      transport: "http",
      endpoint: "http://example.test",
      tools_found: [],
      schema_ok: true,
      failures: [],
      raw: { stub: true },
      secret_demand: false,
    }));

    const traceId = `tr_${randomUUID().slice(0, 8)}`;
    const scoutCtx = agentContext(scout, traceId, ["maiyesh", "files"]);
    const schemaCtx = agentContext(schemaAgent, traceId, ["maiyesh", "files"]);

    const allowed = await host.kernel.invokeTool(scoutCtx, {
      id: randomUUID(),
      tool: "maiyesh.probe",
      arguments: { endpoint: "http://example.test", transport: "http" },
      traceId,
      requestedAt: scoutCtx.now,
    });
    assert.equal(allowed.status, "succeeded");

    const denied = await host.kernel.invokeTool(schemaCtx, {
      id: randomUUID(),
      tool: "maiyesh.probe",
      arguments: { endpoint: "http://example.test", transport: "http" },
      traceId,
      requestedAt: schemaCtx.now,
    });
    assert.equal(denied.status, "denied");
  });
});

describe("maiyesh trial engine", () => {
  it("returns a TrialReport with SharedOS decisions", async () => {
    const report = await runTrial(
      {
        endpoint: "http://127.0.0.1:9",
        transport: "http",
        claims: ["sub-second responses"],
      },
      () =>
        createMaiyeshHost(async () => ({
          reachable: true,
          latency_ms: 40,
          transport: "http",
          endpoint: "http://127.0.0.1:9",
          tools_found: [],
          schema_ok: true,
          failures: [],
          raw: { ok: true },
          secret_demand: false,
        })),
    );

    assert.equal(report.product, "maiyesh");
    assert.equal(report.reachable, true);
    assert.ok(report.receipt_id.startsWith("rcpt_"));
    assert.equal(report.audit_purpose, "arena.product_trial");
    assert.ok(report.sharedos.decisions.some((d) => d.agent === "maiyesh.scout" && d.status === "succeeded"));
    assert.ok(
      report.sharedos.decisions.some(
        (d) => d.agent === "maiyesh.schema" && d.tool === "maiyesh.probe" && d.status === "denied",
      ),
    );
  });
});

describe("maiyesh MCP JSON-RPC", () => {
  it("lists tools and answers health", async () => {
    const listed = (await handleMcpJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    })) as { result: { tools: Array<{ name: string }> } };
    assert.ok(listed.result.tools.some((t) => t.name === "maiyesh_trial"));

    const health = (await handleMcpJsonRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "maiyesh_health", arguments: {} },
    })) as { result: { structuredContent: { ok: boolean } } };
    assert.equal(health.result.structuredContent.ok, true);
  });
});
