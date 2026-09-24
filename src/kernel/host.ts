import type {
  AccessContext,
  Address,
  CapabilityGrant,
  JsonObject,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from "@aicoo/sharedos-contracts";
import type { ToolHandler } from "@aicoo/sharedos-core";
import {
  CapabilityAuthorizer,
  InMemoryGrantUsageStore,
  SharedOSKernel,
  agentExecutionCapability,
  registerStandardOsTools,
} from "@aicoo/sharedos";
import {
  InMemoryAuditSink,
  InMemoryGrantSource,
  InMemoryResourceProvider,
  createTestGrant,
} from "@aicoo/sharedos-testkit";
import { NAMESPACE, PURPOSE } from "../types.js";

export const owner: Address = { kind: "human", userId: "maiyesh-owner" };
export const scout: Address = { kind: "agent", agentId: "maiyesh.scout" };
export const schemaAgent: Address = { kind: "agent", agentId: "maiyesh.schema" };
export const judge: Address = { kind: "agent", agentId: "maiyesh.judge" };

export type ProbePayload = {
  endpoint: string;
  transport: "mcp" | "http" | "cli";
  tool_name?: string;
  sample_input?: Record<string, unknown>;
};

export type MaiyeshHost = {
  kernel: SharedOSKernel;
  audit: InMemoryAuditSink;
  grants: InMemoryGrantSource;
  store: Map<string, unknown>;
};

function grantMap(): CapabilityGrant[] {
  return [
    createTestGrant({
      id: "grant-invoke-scout",
      namespaceId: NAMESPACE,
      subject: scout,
      issuer: owner,
      capabilities: [agentExecutionCapability(scout, owner)],
      purposes: [PURPOSE],
    }),
    createTestGrant({
      id: "grant-invoke-schema",
      namespaceId: NAMESPACE,
      subject: schemaAgent,
      issuer: owner,
      capabilities: [agentExecutionCapability(schemaAgent, owner)],
      purposes: [PURPOSE],
    }),
    createTestGrant({
      id: "grant-invoke-judge",
      namespaceId: NAMESPACE,
      subject: judge,
      issuer: owner,
      capabilities: [agentExecutionCapability(judge, owner)],
      purposes: [PURPOSE],
    }),
    createTestGrant({
      id: "grant-scout-probe",
      namespaceId: NAMESPACE,
      subject: scout,
      issuer: owner,
      capabilities: [
        {
          resource: { namespace: "maiyesh", path: ["probe"], owner },
          actions: ["invoke"],
          scope: "exact",
        },
        {
          resource: { namespace: "files", path: ["maiyesh", "raw"], owner },
          actions: ["create", "replace", "append", "list", "stat", "read"],
          scope: "descendants",
        },
      ],
      purposes: [PURPOSE],
      maxUses: 80,
    }),
    createTestGrant({
      id: "grant-schema-read",
      namespaceId: NAMESPACE,
      subject: schemaAgent,
      issuer: owner,
      capabilities: [
        {
          resource: { namespace: "files", path: ["maiyesh", "raw"], owner },
          actions: ["list", "stat", "read", "search", "grep"],
          scope: "descendants",
        },
      ],
      purposes: [PURPOSE],
    }),
    createTestGrant({
      id: "grant-judge-report",
      namespaceId: NAMESPACE,
      subject: judge,
      issuer: owner,
      capabilities: [
        {
          resource: { namespace: "files", path: ["maiyesh", "raw"], owner },
          actions: ["list", "stat", "read"],
          scope: "descendants",
        },
        {
          resource: { namespace: "files", path: ["maiyesh", "reports"], owner },
          actions: ["create", "replace", "append", "list", "stat", "read"],
          scope: "descendants",
        },
      ],
      purposes: [PURPOSE],
    }),
    createTestGrant({
      id: "grant-scout-escalate",
      namespaceId: NAMESPACE,
      subject: scout,
      issuer: owner,
      capabilities: [
        {
          resource: { namespace: "sharedos", path: ["escalation"], owner },
          actions: ["request"],
          scope: "exact",
        },
      ],
      purposes: [PURPOSE],
    }),
  ];
}

const PROBE_DEFINITION: ToolDefinition = {
  name: "maiyesh.probe",
  namespace: "maiyesh",
  description:
    "Probe an external agent service (MCP / HTTP / CLI). Scout-only. Never accepts secrets.",
  source: "host",
  readWrite: "read",
  inputSchema: {
    type: "object",
    required: ["endpoint", "transport"],
    additionalProperties: false,
    properties: {
      endpoint: { type: "string" },
      transport: { type: "string", enum: ["mcp", "http", "cli"] },
      tool_name: { type: "string" },
      sample_input: { type: "object" },
    },
  },
  requiredCapability: {
    resource: { namespace: "maiyesh", path: ["probe"], owner },
    action: "invoke",
  },
  annotations: { readOnly: true, idempotent: true },
};

export function createMaiyeshHost(
  probeHandler: (payload: ProbePayload) => Promise<unknown>,
): MaiyeshHost {
  const store = new Map<string, unknown>();
  const audit = new InMemoryAuditSink();
  const grants = new InMemoryGrantSource(grantMap());

  const files = new InMemoryResourceProvider("files", async (operation) => {
    const pathKey = operation.resource.path.join("/");
    const now = operation.context.now;
    const op = operation.action;

    if (op === "list") {
      const prefix = pathKey ? `${pathKey}/` : "";
      const entries = [...store.keys()]
        .filter((k) => (pathKey === "" ? true : k === pathKey || k.startsWith(prefix)))
        .map((k) => ({ path: k.split("/"), kind: "file" }));
      return {
        operationId: operation.operationId,
        status: "succeeded" as const,
        completedAt: now,
        output: { entries },
      };
    }

    if (op === "stat" || op === "read") {
      if (!store.has(pathKey)) {
        return {
          operationId: operation.operationId,
          status: "failed" as const,
          completedAt: now,
          error: { code: "not_found", message: `No file at ${pathKey}` },
        };
      }
      const value = store.get(pathKey);
      const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      return {
        operationId: operation.operationId,
        status: "succeeded" as const,
        completedAt: now,
        output:
          op === "stat"
            ? { path: operation.resource.path, size: text.length }
            : { text },
      };
    }

    if (op === "create" || op === "replace" || op === "append") {
      const input = (operation.input ?? {}) as { content?: unknown };
      const content = input.content ?? operation.input;
      if (op === "append" && store.has(pathKey)) {
        const prev = store.get(pathKey);
        store.set(
          pathKey,
          `${typeof prev === "string" ? prev : JSON.stringify(prev)}\n${typeof content === "string" ? content : JSON.stringify(content)}`,
        );
      } else {
        store.set(pathKey, content);
      }
      return {
        operationId: operation.operationId,
        status: "succeeded" as const,
        completedAt: now,
        output: { path: operation.resource.path, wrote: true },
      };
    }

    if (op === "search" || op === "grep") {
      const input = (operation.input ?? {}) as { query?: string; pattern?: string };
      const query = String(input.query ?? input.pattern ?? "").toLowerCase();
      const hits = [...store.entries()]
        .filter(([k]) => k === pathKey || k.startsWith(`${pathKey}/`))
        .filter(([, v]) => JSON.stringify(v).toLowerCase().includes(query))
        .map(([k, v]) => ({
          path: k.split("/"),
          text: (typeof v === "string" ? v : JSON.stringify(v)).slice(0, 400),
        }));
      return {
        operationId: operation.operationId,
        status: "succeeded" as const,
        completedAt: now,
        output: { hits },
      };
    }

    return {
      operationId: operation.operationId,
      status: "failed" as const,
      completedAt: now,
      error: { code: "unsupported", message: `Unsupported files action ${op}` },
    };
  });

  const kernel = new SharedOSKernel({
    grantSource: grants,
    authorizer: new CapabilityAuthorizer({
      usageStore: new InMemoryGrantUsageStore(),
    }),
    audit,
  });

  kernel.registerResourceProvider(files);
  registerStandardOsTools(kernel, { files });

  const probeTool: ToolHandler = {
    definition: PROBE_DEFINITION,
    parseArguments: (arguments_: JsonObject) => arguments_,
    resolveRequirement: () => ({
      resource: { namespace: "maiyesh", path: ["probe"], owner },
      action: "invoke",
    }),
    async invoke(context: AccessContext, call: ToolCall): Promise<ToolResult> {
      const args = (call.arguments ?? {}) as ProbePayload;
      const blob = JSON.stringify(args);
      if (/secret|password|api[_-]?key|bearer\s+[a-z0-9]|authorization/i.test(blob)) {
        return {
          callId: call.id,
          tool: call.tool,
          status: "denied",
          completedAt: context.now,
          error: {
            code: "secret_demand",
            message: "Maiyesh refuses probes that embed or request secrets.",
          },
        };
      }
      try {
        const result = await probeHandler(args);
        const safe = JSON.parse(JSON.stringify(result)) as JsonObject;
        const rawPath = ["maiyesh", "raw", `${context.traceId}.json`];
        store.set(rawPath.join("/"), safe);
        return {
          callId: call.id,
          tool: call.tool,
          status: "succeeded",
          completedAt: context.now,
          output: { raw_path: rawPath, result: safe },
        };
      } catch (err) {
        return {
          callId: call.id,
          tool: call.tool,
          status: "failed",
          completedAt: context.now,
          error: {
            code: "probe_failed",
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    },
  };

  kernel.registerTool(probeTool);

  return { kernel, audit, grants, store };
}

export function agentContext(
  actor: Address,
  traceId: string,
  enabledToolNamespaces: string[],
): AccessContext {
  return {
    namespaceId: NAMESPACE,
    actor,
    authority: owner,
    owner,
    purpose: PURPOSE,
    traceId,
    enabledToolNamespaces,
    now: new Date().toISOString(),
  };
}

export function describeGrantMap(): string {
  return `
namespace: ${NAMESPACE}
purpose:   ${PURPOSE}

human.maiyesh-owner
  → maiyesh.scout
      tools: maiyesh.probe (invoke)
      files: maiyesh/raw/* (create|replace|read|list)
      escalate: sharedos/escalation (request)
  → maiyesh.schema
      files: maiyesh/raw/* (read|list|search|grep)
      DENIED: maiyesh.probe
  → maiyesh.judge
      files: maiyesh/raw/* (read|list)
      files: maiyesh/reports/* (create|replace|read|list)
      DENIED: maiyesh.probe

deny by default: secrets/*, net.*, pay.*, any path outside grants
escalation: target demands credentials, second-hop fan-out, oversize payload
`.trim();
}
