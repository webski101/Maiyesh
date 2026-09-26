import { serve } from "@hono/node-server";
import { app } from "./app.js";

const PORT = Number(process.env.MAIYESH_PORT ?? process.env.PORT ?? 3847);

console.log(`Maiyesh listening on http://127.0.0.1:${PORT}`);
console.log(`MCP:  POST http://127.0.0.1:${PORT}/mcp`);
console.log(`Trial: POST http://127.0.0.1:${PORT}/v1/trial`);

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" });
