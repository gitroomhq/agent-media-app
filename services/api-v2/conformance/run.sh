#!/usr/bin/env bash
# Run the official MCP conformance suite against THIS build of the connector.
#
# Hosts dist/routes/mcp.js on :3939 with a fake auth middleware and a stub REST
# backend (the suite has no way to send a bearer, and it must never touch
# production), then runs every server scenario. Failures outside baseline.yml
# fail the job. Requires `pnpm --filter api-v2 build` first.
set -euo pipefail
cd "$(dirname "$0")/.."
SUPABASE_URL=https://stub.supabase.co SUPABASE_SERVICE_ROLE_KEY=stub SUPABASE_ANON_KEY=stub PORT=0 \
  node conformance/host.mjs > /tmp/conformance-host.log 2>&1 &
HOST_PID=$!
trap 'kill $HOST_PID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do grep -q "conf-host ready" /tmp/conformance-host.log 2>/dev/null && break; sleep 1; done
grep -q "conf-host ready" /tmp/conformance-host.log || { echo "connector host did not start"; cat /tmp/conformance-host.log; exit 1; }
npx -y @modelcontextprotocol/conformance@0.1.16 server \
  --url http://localhost:3939/mcp --suite all \
  --expected-failures conformance/baseline.yml
