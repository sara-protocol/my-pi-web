#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${MCP_AUTH_TOKEN:-}" ]]; then
  echo "MCP_AUTH_TOKEN is required. Set a random token of at least 16 characters before starting."
  exit 1
fi

npm run dev &
web_pid=$!
npm run dev:mcp &
mcp_pid=$!

cleanup() {
  kill "$web_pid" "$mcp_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait "$web_pid" "$mcp_pid"
