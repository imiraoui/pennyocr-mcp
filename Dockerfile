# Runs the PennyOCR MCP server standalone (hosted version: https://mcp.pennyocr.com)
FROM node:20-slim
WORKDIR /app
COPY worker.js server.mjs ./
EXPOSE 8000
CMD ["node", "server.mjs"]
