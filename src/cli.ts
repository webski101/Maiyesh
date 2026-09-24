#!/usr/bin/env node
import { runBatch, runTrial } from "./trial/engine.js";
import { PRICE_BATCH, PRICE_TRIAL } from "./types.js";
import { describeGrantMap } from "./kernel/host.js";

function usage(): never {
  console.log(`maiyesh — SharedOS product trials for agents

Usage:
  maiyesh health
  maiyesh grants
  maiyesh trial --endpoint <url> [--transport mcp|http|cli] [--claim text ...] [--tool name]
  maiyesh batch --endpoint <url> [--endpoint <url> ...]

Prices: trial=${PRICE_TRIAL} credits, batch=${PRICE_BATCH} credits
`);
  process.exit(1);
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function flags(args: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1]) out.push(args[++i]!);
  }
  return out;
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd) usage();

if (cmd === "health") {
  console.log(
    JSON.stringify(
      {
        ok: true,
        product: "maiyesh",
        prices: { maiyesh_trial: PRICE_TRIAL, maiyesh_batch: PRICE_BATCH },
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (cmd === "grants") {
  console.log(describeGrantMap());
  process.exit(0);
}

if (cmd === "trial") {
  const endpoint = flag(rest, "--endpoint");
  if (!endpoint) usage();
  const transport = (flag(rest, "--transport") ?? "mcp") as "mcp" | "http" | "cli";
  const claims = flags(rest, "--claim");
  const tool_name = flag(rest, "--tool");
  const report = await runTrial({ endpoint, transport, claims, tool_name });
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

if (cmd === "batch") {
  const endpoints = flags(rest, "--endpoint");
  if (!endpoints.length) usage();
  const transport = (flag(rest, "--transport") ?? "mcp") as "mcp" | "http" | "cli";
  const reports = await runBatch(
    endpoints.map((endpoint) => ({ endpoint, transport, claims: [] })),
  );
  console.log(JSON.stringify({ reports }, null, 2));
  process.exit(0);
}

usage();
