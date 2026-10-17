
/**
 * PR-2.2 Session Manager - FIXED
 * Fixes audit: do not leak knownSessions list to unauthorized requests
 */

export interface Session {
  id: string;
  transport: any;
  server: any;
  auth?: any;
  principalId?: string;
  createdAt: string;
  lastActivity: string;
}

export class SessionManager {
  private sessions = new Map<string, Session>();

  create(id: string, transport: any = {}, server: any = {}, auth?: any): Session {
    const session: Session = {
      id,
      transport,
      server,
      auth,
      principalId: auth?.principalId,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
    };
    this.sessions.set(id, session);
    console.log(`[SessionManager] Created session ${id}, total ${this.sessions.size}`);
    return session;
  }

  get(id: string): Session | undefined {
    const s = this.sessions.get(id);
    if (s) {
      s.lastActivity = new Date().toISOString();
    }
    return s;
  }

  delete(id: string): boolean {
    const deleted = this.sessions.delete(id);
    if (deleted) {
      console.log(`[SessionManager] Deleted session ${id}, total ${this.sessions.size}`);
    }
    return deleted;
  }

  listIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  count(): number {
    return this.sessions.size;
  }

  // For monitoring, not for error responses
  getStats() {
    return {
      count: this.sessions.size,
      sessions: Array.from(this.sessions.values()).map(s => ({
        id: s.id,
        principalId: s.principalId,
        createdAt: s.createdAt,
        lastActivity: s.lastActivity,
      }))
    };
  }
}
