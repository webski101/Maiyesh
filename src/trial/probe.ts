import type { ProbePayload } from "../kernel/host.js";

export type ProbeObservation = {
  reachable: boolean;
  latency_ms: number;
  transport: ProbePayload["transport"];
  endpoint: string;
  tools_found: string[];
  schema_ok: boolean;
  sample?: { in?: unknown; out?: unknown; ok: boolean };
  failures: string[];
  raw: unknown;
  secret_demand: boolean;
};

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeMcp(
  endpoint: string,
  toolName?: string,
  sampleInput?: Record<string, unknown>,
): Promise<Omit<ProbeObservation, "transport" | "endpoint">> {
  const failures: string[] = [];
  const started = Date.now();
  let secret_demand = false;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };

  async function rpc(method: string, params?: unknown, id = 1) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const text = await res.text();
    let body: unknown = text.slice(0, 8_000);
    try {
      body = JSON.parse(text);
    } catch {
      /* keep truncated text */
    }
    return { status: res.status, body };
  }

  try {
    const init = await withTimeout(
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "maiyesh", version: "0.1.0" },
      }),
      20_000,
    );

    // Best-effort initialized notification (no id).
    await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    }).catch(() => undefined);

    const listed = await withTimeout(rpc("tools/list", {}, 2), 20_000);
    const tools_found: string[] = [];
    const listBody = listed.body as {
      result?: { tools?: Array<{ name?: string; description?: string }> };
      error?: { message?: string };
    };
    if (listBody?.result?.tools) {
      for (const t of listBody.result.tools) {
        if (t.name) tools_found.push(t.name);
        const desc = `${t.name ?? ""} ${t.description ?? ""}`;
        if (/api[_-]?key|secret|password|credential/i.test(desc)) {
          secret_demand = true;
          failures.push(`Tool ${t.name} description appears to demand secrets`);
        }
      }
    } else {
      failures.push("tools/list did not return a tools array");
    }

    let sample: ProbeObservation["sample"];
    let schema_ok = tools_found.length > 0;

    if (toolName) {
      const call = await withTimeout(
        rpc(
          "tools/call",
          { name: toolName, arguments: sampleInput ?? {} },
          3,
        ),
        25_000,
      );
      const callBody = call.body as {
        result?: { isError?: boolean; content?: unknown };
        error?: { message?: string };
      };
      const ok = Boolean(callBody?.result) && !callBody.result?.isError && !callBody.error;
      sample = { in: sampleInput ?? {}, out: callBody, ok };
      if (!ok) failures.push(`sample tools/call for ${toolName} failed`);
      schema_ok = schema_ok && ok;
    }

    if (!init.body || (init.status >= 400 && init.status !== 401)) {
      failures.push(`initialize HTTP ${init.status}`);
    }

    return {
      reachable: init.status > 0 && init.status < 500,
      latency_ms: Date.now() - started,
      tools_found,
      schema_ok,
      sample,
      failures,
      raw: { initialize: init, tools_list: listed },
      secret_demand,
    };
  } catch (err) {
    return {
      reachable: false,
      latency_ms: Date.now() - started,
      tools_found: [],
      schema_ok: false,
      failures: [err instanceof Error ? err.message : String(err)],
      raw: { error: String(err) },
      secret_demand,
    };
  }
}

async function probeHttp(endpoint: string): Promise<Omit<ProbeObservation, "transport" | "endpoint">> {
  const started = Date.now();
  const failures: string[] = [];
  try {
    const res = await withTimeout(fetch(endpoint, { method: "GET" }), 15_000);
    const text = await res.text();
    let body: unknown = text.slice(0, 4_000);
    try {
      body = JSON.parse(text);
    } catch {
      /* keep truncated text */
    }
    if (!res.ok) failures.push(`HTTP ${res.status}`);
    return {
      reachable: res.status > 0,
      latency_ms: Date.now() - started,
      tools_found: [],
      schema_ok: res.ok,
      sample: { in: { method: "GET" }, out: body, ok: res.ok },
      failures,
      raw: { status: res.status, body },
      secret_demand: false,
    };
  } catch (err) {
    return {
      reachable: false,
      latency_ms: Date.now() - started,
      tools_found: [],
      schema_ok: false,
      failures: [err instanceof Error ? err.message : String(err)],
      raw: { error: String(err) },
      secret_demand: false,
    };
  }
}

async function probeCli(endpoint: string): Promise<Omit<ProbeObservation, "transport" | "endpoint">> {
  // CLI probes are declared only — we do not shell out to untrusted strings.
  return {
    reachable: false,
    latency_ms: 0,
    tools_found: [],
    schema_ok: false,
    failures: [
      `CLI transport is declaration-only in Arena mode (refused to exec: ${endpoint.slice(0, 80)})`,
    ],
    raw: { declared: endpoint, executed: false },
    secret_demand: false,
  };
}

export async function runProbe(payload: ProbePayload): Promise<ProbeObservation> {
  const base =
    payload.transport === "mcp"
      ? await probeMcp(payload.endpoint, payload.tool_name, payload.sample_input)
      : payload.transport === "http"
        ? await probeHttp(payload.endpoint)
        : await probeCli(payload.endpoint);

  return {
    ...base,
    transport: payload.transport,
    endpoint: payload.endpoint,
  };
}
