
/**
 * P0-5 FIX: Persistent Audit Log
 * mcp-server/security/audit.ts
 */
import fs from "fs/promises";
import path from "path";

type AuditEvent = {
  ts: string; principalId: string; sessionId: string; taskId: string;
  action: string; target: string; decision: string; result: string;
  policyVersion: string;
};

export class AuditLogger {
  constructor(private filePath: string) {}
  async log(ev: AuditEvent): Promise<void> {
    const line = JSON.stringify(ev)+"\n";
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.appendFile(this.filePath, line, { flag: "a" });
    } catch (e) {
      // P0-5: For high-risk actions, audit failure must block execution
      if (["command_exec","file_write","approve","cancel"].includes(ev.action)) {
        throw new Error("AUDIT_WRITE_FAILED: refusing to execute without audit");
      }
      console.error("Audit write failed (non-blocking)", e);
    }
  }
}
