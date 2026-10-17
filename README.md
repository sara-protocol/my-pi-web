# MY-PI-WEB

MY-PI-WEB is a local web interface for an Ollama-backed coding assistant, with a separate MCP server for workspace tools and the SARA task lifecycle.

> This repository is an active prototype. The login screen is a visual mock and does not authenticate users. Do not expose the web app or MCP server to an untrusted network.

## What is implemented

- **Next.js web app** on port `30141`: chat, session/file UI, and small example pages.
- **Local agent**: `lib/local-agent.ts` calls Ollama (`qwen2.5-coder:7b` by default) and delegates workspace tools to `lib/file-tools.ts`.
- **MCP service** on port `30142`: `mcp-server/index.ts` exposes workspace file operations, an allowlisted command tool, and SARA task tools over the MCP SSE transport.
- **SARA task core**: persistent task lifecycle, session-scoped access, approval state, and SSE session management are implemented under `mcp-server/`.

The web login page is not connected to MCP authentication. MCP validates one shared bearer token (`MCP_AUTH_TOKEN`); production requires it, and all MCP requests are rejected when no token is configured. This is not per-user authentication and does not protect the web API.

## Requirements

- Node.js 20 or newer
- npm
- Ollama for chat functionality

## Run locally

```bash
npm ci
ollama pull qwen2.5-coder:7b
npm run dev
```

Open <http://localhost:30141>. To start the MCP service in another terminal:

```bash
$env:MCP_AUTH_TOKEN = "replace-with-a-random-token-at-least-16-characters"
npm run dev:mcp
```

On macOS/Linux, set the environment variable with `export MCP_AUTH_TOKEN=...` before `npm run dev:mcp`. To start both services with the helper scripts, set the token first, then run `start.bat` (Windows) or `bash start.sh` (macOS/Linux). The web app and MCP service bind to `127.0.0.1` by default. Set `MCP_BIND_HOST` only when you understand the network exposure and have configured authentication, TLS, and an explicit `MCP_CORS_ORIGIN` allowlist.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama API URL used by the web agent |
| `OLLAMA_MODEL` | `qwen2.5-coder:7b` | Model used by the web agent |
| `MCP_BIND_HOST` | `127.0.0.1` | MCP bind address |
| `MCP_PORT` | `30142` | MCP port |
| `MCP_AUTH_TOKEN` | unset | Bearer token for MCP; required in production |
| `MCP_CORS_ORIGIN` | `http://localhost:30141` | Comma-separated browser origin allowlist |
| `MCP_ENABLE_RUN_COMMAND` | unset | Enables the MCP and local-agent command tools; commands still pass through the allowlist and path policy |

## MCP connection

The SSE endpoint is `http://localhost:30142/sse`. MCP clients must send `Authorization: Bearer <MCP_AUTH_TOKEN>` on the SSE connection and message requests. Configure the client to pass that header using the client's supported HTTP header setting. The exact configuration differs by client and version; verify header forwarding before relying on the connection. The server currently uses one shared token, not per-user identities or the Web login page.

The currently registered MCP tools are `list_files`, `read_file`, `write_file`, `run_command`, `create_task`, `list_tasks`, `get_task`, `approve_task`, `cancel_task`, and `count_tasks`. `run_command` is disabled unless explicitly enabled and only permits commands accepted by the command policy. High-risk task approvals are represented in the SARA lifecycle; a visual approval flow in the web UI is not implied by this API.

## Development and checks

```bash
npm ci
npm run typecheck
npm test
npm run build
```

`npm test` runs the Vitest suite under `mcp-server/` and `tests/e2e/`. GitHub Actions runs the same checks for pull requests and pushes to `main`; failures block the workflow.

## Project layout

```text
app/                    Next.js pages and API routes
components/             Chat, file explorer, and session UI
lib/                    Ollama agent and web workspace tools
mcp-server/security/    Path, command, authentication, and audit policy
mcp-server/transport/   MCP session and SSE transport management
mcp-server/sara/        SARA task service
mcp-server/task-core.ts Persistent task lifecycle
tests/e2e/              SARA end-to-end tests
```

## Security notes

- Keep the MCP listener on loopback unless remote access is deliberately configured.
- Use a high-entropy `MCP_AUTH_TOKEN`; do not commit it or put it in a URL.
- Keep `MCP_ENABLE_RUN_COMMAND` disabled unless needed.
- Treat the web login page as a mock. It does not protect the web API; the web app binds to loopback to limit network exposure.
- Keep `MCP_ENABLE_RUN_COMMAND` unset unless command execution is needed. The MCP and local-agent tools share the command policy and execute arguments without a shell.

## License

MIT. See the repository license terms.
