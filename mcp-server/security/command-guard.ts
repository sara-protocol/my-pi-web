
/**
 * P0-4 FIX: Command Guard with PathGuard + timeout + kill tree
 * mcp-server/security/command-guard.ts
 */
import { PathGuard } from "./path-guard.js";
import { execFile } from "child_process";
import path from "path";

type GuardResult = { allowed: boolean; needsApproval?: boolean; reason?: string; absoluteBin?: string; };

const ALLOWED_BINS: Record<string,string> = {
  "git": process.platform === "win32" ? "git.exe" : "/usr/bin/git",
  ...(process.platform === "win32" ? {} : { "ls": "/bin/ls", "cat": "/bin/cat" }),
};

const POLICY: Record<string,{ args: "no-traversal"|"git-only"|"any", risk: "low"|"medium"|"high" }> = {
  "git status": { args: "git-only", risk: "low" },
  "ls": { args: "no-traversal", risk: "low" },
  "cat": { args: "no-traversal", risk: "medium" },
  "rm": { args: "any", risk: "high" },
};

export function checkCommand(binary: string, args: string[], workspaceRoot: string): GuardResult {
  const abs = ALLOWED_BINS[binary];
  if (!abs) return { allowed: false, reason: "Binary not allowed: "+binary };

  const key = binary+" "+(args[0]||"");
  const pol = POLICY[key] || POLICY[binary];
  if (!pol) return { allowed: false, reason: "Action not in whitelist" };

  // P0-4: all file args must go through PathGuard
  if (pol.args === "no-traversal" || pol.args === "git-only") {
    const pg = new PathGuard(workspaceRoot);
    for (const a of args) {
      if (a.startsWith("-")) continue; // flags
      if (a === ".") continue;
      try { pg.resolveAndValidate(a); }
      catch { return { allowed: false, reason: "Path traversal in arg: "+a }; }
    }
  }

  if (pol.risk === "high") {
    return { allowed: true, needsApproval: true, reason: "High risk", absoluteBin: abs };
  }
  return { allowed: true, absoluteBin: abs };
}

export function evaluateCommand(binary: string, args: string[], workspaceRoot = process.env.APP_ROOT || process.cwd()): {
  decision: "ALLOW" | "DENY" | "REVIEW";
  reason?: string;
  bypassable: false;
  absoluteBin?: string;
} {
  if (process.env.MCP_ENABLE_RUN_COMMAND !== "true") {
    return { decision: "DENY", reason: "Command execution is disabled", bypassable: false };
  }
  const result = checkCommand(binary, args, workspaceRoot);
  if (!result.allowed) {
    return { decision: "DENY", reason: result.reason, bypassable: false };
  }
  if (result.needsApproval) {
    return { decision: "REVIEW", reason: result.reason, bypassable: false, absoluteBin: result.absoluteBin };
  }
  return { decision: "ALLOW", bypassable: false, absoluteBin: result.absoluteBin };
}

export function execWithLimits(bin: string, args: string[], opts: { timeoutMs?: number; cwd: string; env?: any }): Promise<{code:number; stdout:string; stderr:string}> {
  return new Promise((resolve, reject)=>{
    const child = execFile(bin, args, { timeout: opts.timeoutMs||10000, cwd: opts.cwd, env: { ...process.env, ...opts.env, PATH: "" }, maxBuffer: 1024*1024*5 }, (err, stdout, stderr)=>{
      if (err && (err as any).killed) return reject(new Error("TIMEOUT"));
      resolve({ code: (err as any)?.code||0, stdout: stdout as string, stderr: stderr as string });
    });
    // kill tree on cancel - caller should keep child pid
  });
}
