FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip bash curl

# Install uv, then use it to install hass-mcp with Python 3.13.
# Alpine ships Python 3.12 but hass-mcp requires >=3.13; uv manages its own runtime.
RUN pip3 install --break-system-packages uv
RUN uv tool install --python 3.13 hass-mcp

# Install supergateway and all npm-based MCP servers globally.
RUN npm install -g \
    supergateway@latest \
    @modelcontextprotocol/server-github \
    n8n-mcp \
    @dokploy/mcp

# uv tool install places binaries in ~/.local/bin — add to PATH.
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app
COPY gateway.mjs /app/gateway.mjs

EXPOSE 3000 3001 3002 3004 3005

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -sf http://localhost:3000/health || exit 1

CMD ["node", "/app/gateway.mjs"]
