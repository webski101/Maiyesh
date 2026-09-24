import { randomUUID } from "node:crypto";
import type { Address } from "@aicoo/sharedos-contracts";
import {
  agentContext,
  createMaiyeshHost,
  judge,
  owner,
  schemaAgent,
  scout,
  type MaiyeshHost,
} from "../kernel/host.js";
import {
  NAMESPACE,
  PURPOSE,
  type TrialReport,
  type TrialRequest,
} from "../types.js";
import { runProbe, type ProbeObservation } from "./probe.js";

export type DecisionRow = {
  agent: string;
  tool: string;
  status: string;
  code?: string;
};

function agentId(addr: Address): string {
  return addr.kind === "agent" ? addr.agentId : JSON.stringify(addr);
}

function scoreObservation(
  obs: ProbeObservation,
  claims: string[],
): Pick<
  TrialReport,
  "score" | "verdict" | "disagreements" | "claims_checked" | "summary"
> {
  const disagreements: string[] = [];
  const claims_checked: TrialReport["claims_checked"] = [];

  let score = 0;
  if (obs.reachable) score += 0.35;
  else disagreements.push("Target was not reachable within the trial window");

  if (obs.schema_ok) score += 0.25;
  else disagreements.push("Schema / sample call did not check out");

  if (obs.latency_ms > 0 && obs.latency_ms < 5_000) score += 0.2;
  else if (obs.latency_ms >= 5_000) {
    score += 0.05;
    disagreements.push(
      `Latency ${obs.latency_ms}ms is slow for a one-hour Arena round`,
    );
  }

  if (obs.tools_found.length > 0) score += 0.1;
  if (obs.failures.length === 0) score += 0.1;

  for (const claim of claims) {
    const lower = claim.toLowerCase();
    let status: "supported" | "contradicted" | "unchecked" = "unchecked";
    let note: string | undefined;

    if (/sub-?second|under 1s|< ?1s|instant/.test(lower)) {
      if (obs.latency_ms > 1000) {
        status = "contradicted";
        note = `Observed ${obs.latency_ms}ms`;
        disagreements.push(
          `Claimed fast/sub-second but trial latency was ${obs.latency_ms}ms`,
        );
      } else if (obs.reachable) {
        status = "supported";
        note = `Observed ${obs.latency_ms}ms`;
      }
    } else if (/mcp/.test(lower)) {
      if (obs.transport === "mcp" && obs.tools_found.length > 0) {
        status = "supported";
        note = `Found tools: ${obs.tools_found.slice(0, 5).join(", ")}`;
      } else if (obs.transport === "mcp") {
        status = "contradicted";
        note = "MCP endpoint did not list tools";
        disagreements.push(
          "Claimed MCP surface but tools/list was empty or failed",
        );
      }
    } else if (obs.tools_found.some((t) => lower.includes(t.toLowerCase()))) {
      status = "supported";
      note = "Matching tool name observed";
    }

    claims_checked.push({ claim, status, note });
  }

  if (obs.secret_demand) {
    score = Math.min(score, 0.2);
    disagreements.push(
      "Target appears to demand secrets — unsafe for Arena buyers",
    );
  }

  score = Math.max(0, Math.min(1, Number(score.toFixed(2))));

  const verdict: TrialReport["verdict"] =
    score >= 0.75
      ? "buy_if_price_le_15"
      : score >= 0.55
        ? "buy_if_price_le_30"
        : score >= 0.35
          ? "try_free_only"
          : "skip";

  const summary = [
    obs.reachable ? "reachable" : "unreachable",
    `${obs.latency_ms}ms`,
    obs.tools_found.length ? `${obs.tools_found.length} tools` : "no tools",
    `score ${score}`,
    verdict,
  ].join(" · ");

  return { score, verdict, disagreements, claims_checked, summary };
}

async function invokeAs(
  host: MaiyeshHost,
  actor: Address,
  traceId: string,
  namespaces: string[],
  tool: string,
  args: Record<string, unknown>,
  decisions: DecisionRow[],
) {
  const context = agentContext(actor, traceId, namespaces);
  const result = await host.kernel.invokeTool(context, {
    id: randomUUID(),
    tool,
    arguments: args,
    traceId,
    requestedAt: context.now,
  });

  decisions.push({
    agent: agentId(actor),
    tool,
    status: result.status,
    code: result.status === "succeeded" ? undefined : result.error?.code,
  });

  return { result, context };
}

export async function runTrial(
  request: TrialRequest,
  hostFactory: () => MaiyeshHost = () => createMaiyeshHost(runProbe),
): Promise<TrialReport> {
  const host = hostFactory();
  const receipt_id = `rcpt_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const traceId = `tr_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const decisions: DecisionRow[] = [];

  const probeArgs: Record<string, unknown> = {
    endpoint: request.endpoint,
    transport: request.transport ?? "mcp",
  };
  if (request.tool_name) probeArgs.tool_name = request.tool_name;
  if (request.sample_input) probeArgs.sample_input = request.sample_input;

  const scoutProbe = await invokeAs(
    host,
    scout,
    traceId,
    ["maiyesh", "files"],
    "maiyesh.probe",
    probeArgs,
    decisions,
  );

  let observation: ProbeObservation;
  if (scoutProbe.result.status === "succeeded") {
    const out = scoutProbe.result.output as { result?: ProbeObservation };
    observation = (out.result ?? out) as ProbeObservation;
  } else {
    observation = {
      reachable: false,
      latency_ms: 0,
      transport: request.transport ?? "mcp",
      endpoint: request.endpoint,
      tools_found: [],
      schema_ok: false,
      failures: [
        scoutProbe.result.status === "denied" ||
        scoutProbe.result.status === "failed"
          ? scoutProbe.result.error.message
          : "scout probe failed",
      ],
      raw: scoutProbe.result,
      secret_demand: scoutProbe.result.status === "denied",
    };
  }

  const schemaDenied = await invokeAs(
    host,
    schemaAgent,
    traceId,
    ["maiyesh", "files"],
    "maiyesh.probe",
    {
      endpoint: request.endpoint,
      transport: request.transport ?? "mcp",
    },
    decisions,
  );

  const rawPath = ["maiyesh", "raw", `${traceId}.json`];
  await invokeAs(
    host,
    schemaAgent,
    traceId,
    ["files"],
    "files.read",
    { path: rawPath },
    decisions,
  );

  const scored = scoreObservation(observation, request.claims ?? []);
  const reportPath = ["maiyesh", "reports", `${receipt_id}.json`];

  const draft: TrialReport = {
    product: "maiyesh",
    target: request.endpoint,
    transport: request.transport ?? "mcp",
    reachable: observation.reachable,
    latency_ms: observation.latency_ms,
    schema_ok: observation.schema_ok,
    ...(observation.sample ? { sample: observation.sample } : {}),
    tools_found: observation.tools_found,
    failures: [...observation.failures],
    ...scored,
    audit_purpose: PURPOSE,
    receipt_id,
    sharedos: {
      namespace: NAMESPACE,
      agents: [agentId(scout), agentId(schemaAgent), agentId(judge)],
      decisions,
    },
  };

  if (schemaDenied.result.status === "succeeded") {
    draft.failures.push("SECURITY BUG: schema agent was allowed to probe");
    draft.score = 0;
    draft.verdict = "skip";
  }

  const reportJson = JSON.parse(JSON.stringify(draft)) as TrialReport;

  await invokeAs(
    host,
    judge,
    traceId,
    ["files"],
    "files.create",
    { path: reportPath, content: reportJson },
    decisions,
  );

  await invokeAs(
    host,
    judge,
    traceId,
    ["maiyesh", "files"],
    "maiyesh.probe",
    {
      endpoint: request.endpoint,
      transport: request.transport ?? "mcp",
    },
    decisions,
  );

  draft.sharedos.decisions = decisions;
  host.store.set(`maiyesh/reports/${receipt_id}.json`, reportJson);
  host.store.set("maiyesh/meta/owner", owner);

  return JSON.parse(JSON.stringify(draft)) as TrialReport;
}

export async function runBatch(targets: TrialRequest[]): Promise<TrialReport[]> {
  const out: TrialReport[] = [];
  for (const t of targets.slice(0, 3)) {
    out.push(await runTrial(t));
  }
  return out;
}
