import { z } from "zod";

export const TransportSchema = z.enum(["mcp", "http", "cli"]);
export type Transport = z.infer<typeof TransportSchema>;

export const TrialRequestSchema = z.object({
  endpoint: z.string().min(1).describe("MCP URL, HTTP URL, or CLI command template"),
  transport: TransportSchema.default("mcp"),
  claims: z.array(z.string()).default([]),
  sample_input: z.record(z.unknown()).optional(),
  tool_name: z.string().optional().describe("For MCP: tool to sample-call after list"),
  price_credits: z.number().nonnegative().optional(),
});
export type TrialRequest = z.infer<typeof TrialRequestSchema>;

export const BatchRequestSchema = z.object({
  targets: z.array(TrialRequestSchema).min(1).max(3),
});
export type BatchRequest = z.infer<typeof BatchRequestSchema>;

export const TrialReportSchema = z.object({
  product: z.literal("maiyesh"),
  target: z.string(),
  transport: TransportSchema,
  reachable: z.boolean(),
  latency_ms: z.number(),
  schema_ok: z.boolean(),
  sample: z
    .object({
      in: z.unknown().optional(),
      out: z.unknown().optional(),
      ok: z.boolean(),
    })
    .optional(),
  tools_found: z.array(z.string()).default([]),
  failures: z.array(z.string()).default([]),
  score: z.number().min(0).max(1),
  verdict: z.enum([
    "buy_if_price_le_15",
    "buy_if_price_le_30",
    "try_free_only",
    "skip",
  ]),
  disagreements: z.array(z.string()),
  claims_checked: z.array(
    z.object({
      claim: z.string(),
      status: z.enum(["supported", "contradicted", "unchecked"]),
      note: z.string().optional(),
    }),
  ),
  audit_purpose: z.string(),
  receipt_id: z.string(),
  sharedos: z.object({
    namespace: z.string(),
    agents: z.array(z.string()),
    decisions: z.array(
      z.object({
        agent: z.string(),
        tool: z.string(),
        status: z.string(),
        code: z.string().optional(),
      }),
    ),
  }),
  summary: z.string(),
});
export type TrialReport = z.infer<typeof TrialReportSchema>;

export const PURPOSE = "arena.product_trial" as const;
export const NAMESPACE = "maiyesh.arena" as const;
export const PRICE_TRIAL = 10;
export const PRICE_BATCH = 24;
