import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

/**
 * Vercel Node entry. Explicit `routes` in vercel.json send traffic here.
 * Health responds without loading SharedOS; other paths lazy-load dist/app.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `https://${host}`);
  // Routes dest to /api; original path is usually preserved on req.url.
  let path = url.pathname;
  if (path === "/api" || path.startsWith("/api/")) {
    path = path.replace(/^\/api\/?/, "/") || "/";
  }

  if (req.method === "OPTIONS") {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-headers", "content-type");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.status(204).end();
    return;
  }

  if (path === "/health") {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("access-control-allow-origin", "*");
    res.status(200).json({
      ok: true,
      product: "maiyesh",
      p95_budget_ms: 45_000,
      prices: { maiyesh_trial: 10, maiyesh_batch: 24 },
      purpose: "arena.product_trial",
    });
    return;
  }

  const { app } = await import("../dist/app.js");
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(","));
  }
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : typeof req.body === "string"
        ? req.body
        : req.body != null
          ? JSON.stringify(req.body)
          : undefined;
  const target = new URL(path + url.search, url.origin);
  const request = new Request(target, {
    method: req.method,
    headers,
    body,
  });
  const response = await app.fetch(request);
  res.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });
  res.send(Buffer.from(await response.arrayBuffer()));
}
