import { createHash, timingSafeEqual } from "crypto";

/**
 * P0-2 + P0-3 FIX: Auth + Principal + Session Binding
 * mcp-server/security/auth.ts
 */
export type Principal = { id: string; principalId: string; role: "user"|"approver"|"admin"; tokenHash: string; };

export function assertAuthConfig() {
  // FIX: Check BOTH NODE_ENV and APP_ENV, and fail closed
  const isProd = process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
  const token = process.env.MCP_AUTH_TOKEN;
  if (isProd && !token) {
    throw new Error("MCP_AUTH_TOKEN required in production");
  }
  if (token && token.length < 16) {
    throw new Error("MCP_AUTH_TOKEN too short");
  }
}

export function getPrincipalFromRequest(req: { headers: Record<string,string> }): Principal | null {
  const token = extractToken(req);
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!token || !expected) return null;

  const supplied = Buffer.from(token);
  const configured = Buffer.from(expected);
  if (supplied.length !== configured.length || !timingSafeEqual(supplied, configured)) return null;

  const tokenHash = hashToken(token);
  const id = "principal_" + tokenHash.slice(0, 16);
  return { id, principalId: id, role: "user", tokenHash };
}

export function extractToken(req: { headers: Record<string, string | undefined> }): string | null {
  const header = req.headers.authorization || req.headers.Authorization;
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function authMiddleware(req: any, res: any, next: () => void): void {
  const principal = getPrincipalFromRequest(req);
  if (!principal) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "A valid bearer token is required" });
    return;
  }
  req.auth = principal;
  next();
}

// REAL authorization, not return true
export function canAccessTask(principal: Principal, task: { sessionId: string; principalId: string }): boolean {
  if (principal.role === "admin") return true;
  return task.principalId === principal.id;
}
export function canApproveTask(principal: Principal, task: { principalId: string }): boolean {
  if (principal.role === "admin" || principal.role === "approver") return true;
  // owner cannot approve own high-risk task
  return false;
}
