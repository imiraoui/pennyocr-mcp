# 🪙 PennyOCR MCP server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that gives any agent
document-reading eyes: PDFs and images by URL → markdown (tables preserved) or plain text,
with **exact cost reporting and hard spend caps**.

**Hosted at `https://mcp.pennyocr.com`** — nothing to install:

```json
{
  "mcpServers": {
    "pennyocr": {
      "url": "https://mcp.pennyocr.com",
      "headers": { "Authorization": "Bearer pk_live_..." }
    }
  }
}
```

Keys are free (first 100 pages free) at [pennyocr.com/dashboard](https://pennyocr.com/dashboard/).
Clients that can't set headers: `https://mcp.pennyocr.com/?key=pk_live_...`

## Tools

| Tool | Input | Output |
| --- | --- | --- |
| `read_document` | `{url, pages?, output?, max_pages?, max_cost_usd?}` | `{content, pages, cost_usd, citations[]}` |
| `estimate_cost` | `{url, pages?}` | page count + exact cost — **free** |
| `check_balance` | `{}` | remaining credits + free-tier allowance — **free** |

The cost caps refuse *before* any processing, with the numbers — so autonomous agents can
reason about spend ("200 pages, $0.15 — proceed") and can never run past a prepaid balance.

## Transport

Streamable HTTP (JSON-RPC 2.0 over POST), stateless. This repo is the complete server —
a single Cloudflare Worker (`worker.js`) proxying the [PennyOCR API](https://pennyocr.com/docs/).

Pricing: $0.75 per 1,000 pages · [pennyocr.com/pricing.txt](https://pennyocr.com/pricing.txt) ·
Agent onboarding: [pennyocr.com/llms.txt](https://pennyocr.com/llms.txt)

## Cursor plugin

This repository includes a Cursor plugin manifest at `.cursor-plugin/plugin.json` and a plugin-specific `mcp.json`. In the plugin configuration, set `PENNYOCR_API_KEY` to your own API key from https://pennyocr.com/dashboard/. The repository contains only a variable placeholder, never a live key. Document reading uses your PennyOCR credits; use cost estimates and spend caps as appropriate. The separate `.mcp.json` uses Cursor environment-variable interpolation for direct MCP configuration.
