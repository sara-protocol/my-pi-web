
/**
 * MY-PI-WEB 2.0 - P0 Hardened + PR-2.2 SARA Server - VERIFIABLE FIX
 * Fixes audit issues:
 * - Production fail-closed auth
 * - No query token
 * - Tightened CORS
 * - Fixed path guard with isSameOrSubPath
 * - Action-level command whitelist
 * - No knownSessions leak
 * - Real module imports in tests
 */

import express from "express";
import cors from "cors";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import * as fs from "fs";
import * as fsp from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { TaskManager } from "./task-core.js";
import { resolveAndValidatePath, atomicWriteFile, getAppRoot, isSameOrSubPath } from "./security/path-guard.js";
import { evaluateCommand } from "./security/command-guard.js";
import { authMiddleware, assertAuthConfig } from "./security/auth.js";
import { SessionManager } from "./transport/session-manager.js";
import { SARAServer } from "./sara/server.js";

const execFileAsync = promisify(execFile);

const APP_ROOT = getAppRoot();
const BIND_HOST = process.env.MCP_BIND_HOST || "127.0.0.1";
const MCP_PORT = parseInt(process.env.MCP_PORT || "30142", 10);
const CORS_ORIGIN = process.env.MCP_CORS_ORIGIN || "http://localhost:30141";

// Assert auth config - fail-closed in production
try {
  assertAuthConfig();
} catch (e: any) {
  console.error(`[FATAL] ${e.message}`);
  if (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production") {
    process.exit(1);
  }
}

console.log(`[MCP-HARDENED-PR2.2] APP_ROOT=${APP_ROOT} BIND=${BIND_HOST}:${MCP_PORT}`);
console.log(`[MCP-HARDENED-PR2.2] P0 fixes: path-guard isSameOrSubPath, command action whitelist, no query token, no knownSessions leak`);

const sessionManager = new SessionManager();

function auditLog(entry: any) {
  console.log(`[AUDIT] ${JSON.stringify(entry)}`);
}

async function safeExecFile(binary: string, args: string[]) {
  const decision = evaluateCommand(binary, args);
  if (decision.decision === "DENY") {
    return { code: 403, decision, stdout: "", stderr: decision.reason };
  }
  if (decision.decision === "REVIEW") {
    return { code: 403, decision, stdout: "", stderr: `NEEDS_APPROVAL: ${decision.reason}` };
  }
  try {
    const result = await execFileAsync(binary, args, { 
      timeout: 10000, 
      maxBuffer: 1024 * 1024,
      cwd: APP_ROOT,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: process.env.NODE_ENV ?? "production" } // Minimal env
    });
    return { code: 0, decision, stdout: result.stdout, stderr: result.stderr };
  } catch (e: any) {
    return { code: e.code || 1, decision, stdout: e.stdout || "", stderr: e.stderr || e.message };
  }
}

const app = express();
app.use(express.json());

// FIXED CORS: No implicit localhost wildcard, no *
const allowedOrigins = CORS_ORIGIN.split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Allow non-browser
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // FIXED: No implicit http://localhost:xxx wildcard
    return callback(new Error(`CORS not allowed: ${origin}`));
  },
  credentials: true,
}));

app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    version: "2.2.0-sara-server",
    p0: "hardened",
    pr: "2.1-task-core-v6 + 2.2-sara-server",
    fixes: ["path-guard isSameOrSubPath", "no query token", "no knownSessions leak", "action whitelist"]
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", sessions: sessionManager.count() });
});

app.get("/sse", authMiddleware, async (req, res) => {
  const sessionIdHint = (req.query.sessionId as string) || `sess_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  
  const server = new McpServer({ name: "my-pi-web-mcp-hardened-pr2.2", version: "2.2.0" });
  const saraServer = new SARAServer(APP_ROOT);
  await saraServer.init();

  try {
    // Register tools with REAL guards
    if ((server as any).tool) {
      (server as any).tool("list_files", "List files", { path: { type: "string" } } as any, async ({ path: p }: any) => {
        const safe = resolveAndValidatePath(p || ".");
        const files = await fsp.readdir(safe);
        auditLog({ action: "list_files", resource: safe, actor: (req as any).auth?.principalId || req.ip, result: "ALLOW" });
        return { content: [{ type: "text", text: JSON.stringify(files.slice(0, 100)) }] };
      });
      
      (server as any).tool("read_file", "Read file", { path: { type: "string" } } as any, async ({ path: p }: any) => {
        const safe = resolveAndValidatePath(p);
        const content = await fsp.readFile(safe, "utf-8");
        auditLog({ action: "read_file", resource: safe, actor: (req as any).auth?.principalId || req.ip, result: "ALLOW" });
        return { content: [{ type: "text", text: content.slice(0, 50000) }] };
      });
      
      (server as any).tool("write_file", "Write file", { path: { type: "string" }, content: { type: "string" } } as any, async ({ path: p, content }: any) => {
        const safe = resolveAndValidatePath(p);
        await atomicWriteFile(p, content, APP_ROOT);
        auditLog({ action: "write_file", resource: safe, actor: (req as any).auth?.principalId || req.ip, result: "ALLOW", size: content.length });
        return { content: [{ type: "text", text: `Written ${safe} (${content.length} chars) via atomic write` }] };
      });
      
      (server as any).tool("run_command", "Run whitelisted command", { command: { type: "string" }, args: { type: "array" } } as any, async ({ command, args }: any) => {
        const result = await safeExecFile(command, args || []);
        auditLog({ action: "run_command", resource: `${command} ${(args||[]).join(" ")}`, actor: (req as any).auth?.principalId || req.ip, result: result.code === 0 ? "ALLOW" : "DENIED", decision: result.decision });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      });

      // SARA Tasks
      (server as any).tool("create_task", "Create SARA task", { title: { type: "string" }, type: { type: "string" }, description: { type: "string" } } as any, async ({ title, type, description }: any, extra: any) => {
        const sessId = (extra as any)?.sessionId || (req as any).query?.sessionId || sessionIdHint;
        const task = await saraServer.createAndStart({ sessionId: sessId, title, type: type || "general", description });
        auditLog({ action: "create_task", resource: task.id, actor: (req as any).auth?.principalId || req.ip, result: "ALLOW" });
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      });
      
      (server as any).tool("list_tasks", "List tasks", {} as any, async (_: any, extra: any) => {
        const sessId = (extra as any)?.sessionId || (req as any).query?.sessionId || sessionIdHint;
        const tasks = await saraServer.list(sessId);
        return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
      });
      
      (server as any).tool("get_task", "Get task", { taskId: { type: "string" } } as any, async ({ taskId }: any, extra: any) => {
        const sessId = (extra as any)?.sessionId || (req as any).query?.sessionId || sessionIdHint;
        const task = await saraServer.get(taskId, sessId);
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      });
      
      (server as any).tool("approve_task", "Approve task", { taskId: { type: "string" }, approved: { type: "boolean" } } as any, async ({ taskId, approved }: any, extra: any) => {
        const sessId = (extra as any)?.sessionId || (req as any).query?.sessionId || sessionIdHint;
        const task = await saraServer.approve(taskId, sessId, approved);
        auditLog({ action: "approve_task", resource: taskId, actor: (req as any).auth?.principalId || req.ip, result: approved ? "APPROVED" : "DENIED" });
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      });
      
      (server as any).tool("cancel_task", "Cancel task", { taskId: { type: "string" } } as any, async ({ taskId }: any, extra: any) => {
        const sessId = (extra as any)?.sessionId || (req as any).query?.sessionId || sessionIdHint;
        const task = await saraServer.cancel(taskId, sessId);
        auditLog({ action: "cancel_task", resource: taskId, actor: (req as any).auth?.principalId || req.ip, result: "ALLOW" });
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      });

      (server as any).tool("count_tasks", "Count tasks", {} as any, async (_: any, extra: any) => {
        const sessId = (extra as any)?.sessionId || (req as any).query?.sessionId || sessionIdHint;
        const counts = await saraServer.counts(sessId);
        return { content: [{ type: "text", text: JSON.stringify(counts, null, 2) }] };
      });
    }
  } catch (e) {
    console.error("[MCP] Tool registration error", e);
  }

  const transport = new SSEServerTransport("/messages", res as any);
  const realSessionId = (transport as any).sessionId || sessionIdHint;
  
  sessionManager.create(realSessionId, transport as any, server as any, (req as any).auth);
  
  res.on("close", () => {
    sessionManager.delete(realSessionId);
    try { (server as any).close?.(); } catch {}
  });
  
  await (server as any).connect(transport);
});

app.post("/messages", authMiddleware, async (req, res) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    return res.status(400).json({ error: "MISSING_SESSION_ID", message: "Provide ?sessionId=xxx" });
  }
  const session = sessionManager.get(sessionId);
  if (!session) {
    auditLog({ action: "messages", sessionId, actor: (req as any).auth?.principalId || req.ip, result: "DENIED", reason: "SESSION_NOT_FOUND" });
    // FIXED: Do NOT leak knownSessions list
    return res.status(404).json({ error: "SESSION_NOT_FOUND", sessionId });
  }
  
  if (session.auth && (req as any).auth) {
    if (session.auth.tokenHash !== (req as any).auth.tokenHash) {
      auditLog({ action: "messages", sessionId, actor: (req as any).auth?.principalId, result: "DENIED", reason: "SESSION_OWNERSHIP_MISMATCH" });
      return res.status(403).json({ error: "SESSION_OWNERSHIP_MISMATCH" });
    }
  }
  
  try {
    await (session.transport as any).handlePostMessage(req, res, req.body);
  } catch (e: any) {
    console.error(`[Session ${sessionId}] message error`, e.message);
    res.status(500).json({ error: "MESSAGE_FAILED", message: e.message });
  }
});

app.listen(MCP_PORT, BIND_HOST, () => {
  console.log(`✅ MY-PI-WEB HARDENED PR-2.2 listening on http://${BIND_HOST}:${MCP_PORT}`);
  console.log(`   SSE: http://${BIND_HOST}:${MCP_PORT}/sse`);
  console.log(`   Health: http://${BIND_HOST}:${MCP_PORT}/health`);
  console.log(`   P0 Fixes: isSameOrSubPath, no query token, no knownSessions leak, action whitelist`);
});
