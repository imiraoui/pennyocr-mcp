// PennyOCR remote MCP server (Streamable HTTP, JSON-RPC 2.0).
//
//   { "mcpServers": { "pennyocr": {
//       "url": "https://mcp.pennyocr.com",
//       "headers": { "Authorization": "Bearer pk_live_..." } } } }
//
// Clients that can't set headers may use https://mcp.pennyocr.com/?key=pk_live_...
// Tools: read_document (OCR by URL, cost in response) · estimate_cost (free).

const TOOLS = [
  {
    name: "read_document",
    description:
      "Read a document (PDF or image) from a URL and return its contents as markdown (tables preserved) or plain text. Costs $0.00075 per page, billed to the PennyOCR account; the response includes the exact cost_usd and per-page citations. Use estimate_cost first for big documents. Supports page ranges and hard spend caps.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "http(s) URL of the PDF or image" },
        pages: { type: "string", description: "Page range like '1-20,25'. Default: all pages." },
        output: { type: "string", enum: ["markdown", "text"], description: "Output format. Default markdown." },
        max_pages: { type: "integer", description: "Refuse (with the numbers) if selection exceeds this many pages." },
        max_cost_usd: { type: "number", description: "Refuse (with the numbers) if the run would cost more than this." },
      },
      required: ["url"],
    },
  },
  {
    name: "estimate_cost",
    description:
      "Free: return the page count and exact cost_usd to read a document URL with read_document, without running OCR. Use before reading large documents.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "http(s) URL of the PDF or image" },
        pages: { type: "string", description: "Optional page range like '1-20'." },
      },
      required: ["url"],
    },
  },
];

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function toolText(id, text, isError = false) {
  return rpcResult(id, { content: [{ type: "text", text }], isError });
}

async function callGateway(env, path, body, apiKey) {
  const r = await fetch(`${env.API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

async function handleRpc(msg, apiKey, env) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: params?.protocolVersion || "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "pennyocr", version: "0.1.0" },
      instructions:
        "PennyOCR reads documents (PDF/images) into markdown or text. read_document costs $0.00075/page (exact cost_usd returned); estimate_cost is free. Get an API key at https://pennyocr.com/dashboard/ — agents: see https://pennyocr.com/llms.txt for keyless signup steps.",
    });
  }
  if (method === "notifications/initialized" || (method || "").startsWith("notifications/")) {
    return null; // notifications need no response
  }
  if (method === "ping") return rpcResult(id, {});
  if (method === "tools/list") return rpcResult(id, { tools: TOOLS });
  if (method === "tools/call") {
    if (!apiKey) {
      return toolText(id,
        "Missing PennyOCR API key. Add headers: {\"Authorization\": \"Bearer pk_live_...\"} to this MCP server config (or ?key=... in the URL). Keys are free at https://pennyocr.com/dashboard/ — 100 pages/month included. Agent signup flow: https://pennyocr.com/llms.txt",
        true);
    }
    const { name, arguments: args = {} } = params || {};
    if (name === "estimate_cost") {
      const r = await callGateway(env, "/v1/estimate", { url: args.url, pages: args.pages }, apiKey);
      if (!r.ok) return toolText(id, `Error ${r.status}: ${r.data.detail || "estimate failed"}`, true);
      return toolText(id, JSON.stringify(r.data, null, 2));
    }
    if (name === "read_document") {
      const r = await callGateway(env, "/v1/ocr/url", {
        url: args.url, pages: args.pages, format: args.output || "markdown",
        max_pages: args.max_pages, max_cost_usd: args.max_cost_usd,
      }, apiKey);
      if (!r.ok) return toolText(id, `Error ${r.status}: ${r.data.detail || "read failed"}`, true);
      const d = r.data;
      const payload = {
        content: d.text,
        pages: d.pages,
        cost_usd: d.cost_usd,
        model: d.model,
        citations: d.page_results.map((p) => ({ page: p.page, chars: p.text.length })),
      };
      return toolText(id, JSON.stringify(payload, null, 2));
    }
    return toolText(id, `Unknown tool: ${name}`, true);
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method === "GET") {
      return new Response(
        "PennyOCR MCP server. POST JSON-RPC here (Streamable HTTP). Docs: https://pennyocr.com/mcp/\n",
        { headers: { "Content-Type": "text/plain", ...cors } });
    }
    const auth = request.headers.get("Authorization") || "";
    const apiKey = auth.startsWith("Bearer ") ? auth.slice(7) : url.searchParams.get("key") || "";

    let body;
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify(rpcError(null, -32700, "Parse error")),
        { status: 400, headers: { "Content-Type": "application/json", ...cors } });
    }
    const messages = Array.isArray(body) ? body : [body];
    const responses = [];
    for (const msg of messages) {
      const resp = await handleRpc(msg, apiKey, env);
      if (resp) responses.push(resp);
    }
    if (responses.length === 0) return new Response(null, { status: 202, headers: cors });
    const out = Array.isArray(body) ? responses : responses[0];
    return new Response(JSON.stringify(out),
      { headers: { "Content-Type": "application/json", ...cors } });
  },
};
