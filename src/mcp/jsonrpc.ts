import { describeGrantMap } from "../kernel/host.js";
import { runBatch, runTrial } from "../trial/engine.js";
import { PRICE_BATCH, PRICE_TRIAL, TrialRequestSchema } from "../types.js";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

const TOOLS = [
  {
    name: "maiyesh_health",
    description: "Free liveness check. Returns ok + pricing.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "maiyesh_grants",
    description: "SharedOS grant map for scout / schema / judge.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "maiyesh_trial",
    description: `Permissioned SharedOS product trial. Price: ${PRICE_TRIAL} Arena credits.`,
    inputSchema: {
      type: "object",
      required: ["endpoint"],
      additionalProperties: false,
      properties: {
        endpoint: {
          type: "string",
          description:
            "Target to trial: MCP URL, HTTP URL, or CLI command template (no secrets).",
        },
        transport: {
          type: "string",
          enum: ["mcp", "http", "cli"],
          description: "How to reach the target. Default mcp if omitted.",
        },
        claims: {
          type: "array",
          items: { type: "string" },
          description:
            "Seller claims to check, e.g. [\"MCP surface\", \"sub-second health\"].",
        },
        sample_input: {
          type: "object",
          description:
            "Optional JSON arguments for a sample tool/HTTP call after discovery.",
        },
        tool_name: {
          type: "string",
          description:
            "For MCP: tool to sample-call after tools/list. Omit to only list tools.",
        },
        price_credits: {
          type: "number",
          description:
            "Optional advertised price of the target (for verdict context). Not charged by Maiyesh.",
        },
      },
    },
  },
  {
    name: "maiyesh_batch",
    description: `Trial up to 3 endpoints. Price: ${PRICE_BATCH} Arena credits.`,
    inputSchema: {
      type: "object",
      required: ["targets"],
      additionalProperties: false,
      properties: {
        targets: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          description: "One to three trial targets (same fields as maiyesh_trial).",
          items: {
            type: "object",
            required: ["endpoint"],
            properties: {
              endpoint: {
                type: "string",
                description: "Target MCP URL, HTTP URL, or CLI template.",
              },
              transport: {
                type: "string",
                enum: ["mcp", "http", "cli"],
                description: "How to reach this target. Default mcp.",
              },
              claims: {
                type: "array",
                items: { type: "string" },
                description: "Claims to check for this target.",
              },
              sample_input: {
                type: "object",
                description: "Optional sample call arguments.",
              },
              tool_name: {
                type: "string",
                description: "Optional MCP tool to sample-call.",
              },
            },
          },
        },
      },
    },
  },
] as const;

function ok(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(
  id: string | number | null | undefined,
  code: number,
  message: string,
) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function toolResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
    structuredContent: typeof data === "string" ? { text: data } : data,
    isError,
  };
}

async function callTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "maiyesh_health":
      return toolResult({
        ok: true,
        product: "maiyesh",
        p95_budget_ms: 45_000,
        prices: { maiyesh_trial: PRICE_TRIAL, maiyesh_batch: PRICE_BATCH },
        purpose: "arena.product_trial",
      });
    case "maiyesh_grants":
      return toolResult(describeGrantMap());
    case "maiyesh_trial": {
      const parsed = TrialRequestSchema.parse(args);
      const report = await runTrial(parsed);
      return toolResult(report);
    }
    case "maiyesh_batch": {
      const targets = Array.isArray(args.targets) ? args.targets : [];
      const parsed = targets.map((t) => TrialRequestSchema.parse(t));
      const reports = await runBatch(parsed);
      return toolResult({ reports });
    }
    default:
      return toolResult({ error: `Unknown tool ${name}` }, true);
  }
}

export async function handleMcpJsonRpc(body: unknown): Promise<unknown> {
  if (Array.isArray(body)) {
    return Promise.all(body.map((item) => handleOne(item as JsonRpcRequest)));
  }
  return handleOne(body as JsonRpcRequest);
}

async function handleOne(msg: JsonRpcRequest): Promise<unknown> {
  if (!msg || msg.jsonrpc !== "2.0" || !msg.method) {
    return err(msg?.id, -32600, "Invalid Request");
  }

  // Notifications
  if (msg.id === undefined && msg.method.startsWith("notifications/")) {
    return null;
  }

  switch (msg.method) {
    case "initialize":
      return ok(msg.id, {
        protocolVersion: "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "maiyesh", version: "0.1.0" },
        instructions:
          "Maiyesh runs permissioned SharedOS product trials. Start with maiyesh_health (free), then maiyesh_trial (10 credits).",
      });
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: TOOLS });
    case "tools/call": {
      const params = (msg.params ?? {}) as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      if (!params.name) return err(msg.id, -32602, "tools/call requires name");
      try {
        const result = await callTool(params.name, params.arguments ?? {});
        return ok(msg.id, result);
      } catch (e) {
        return ok(
          msg.id,
          toolResult(
            {
              error: e instanceof Error ? e.message : String(e),
            },
            true,
          ),
        );
      }
    }
    default:
      return err(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

export { TOOLS, callTool };
