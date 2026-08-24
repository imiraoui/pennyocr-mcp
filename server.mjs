// Standalone runner for the PennyOCR MCP worker (used by Docker/inspectors).
// The hosted deployment is a Cloudflare Worker at https://mcp.pennyocr.com.
import http from "node:http";
import worker from "./worker.js";

const env = { API_BASE: process.env.API_BASE || "https://api.pennyocr.com" };
const port = parseInt(process.env.PORT || "8000", 10);

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://localhost:${port}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`pennyocr-mcp listening on :${port} (streamable HTTP)`));
