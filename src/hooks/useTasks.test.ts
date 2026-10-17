import { describe, it, expect, vi, beforeEach } from "vitest";
global.fetch = vi.fn() as any;

describe("PR-2.5 Frontend Hooks - API Client", () => {
  beforeEach(() => { vi.mocked(fetch).mockReset(); });
  
  it("tasksApi.list calls /api/tasks?sessionId=", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ tasks: [{ id: "1" }] }) } as any);
    const { tasksApi } = await import("../api/sara-client");
    const data = await tasksApi.list("sess_abc");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/tasks?sessionId=sess_abc"), expect.anything());
    expect(data.tasks[0].id).toBe("1");
  });
  
  it("tasksApi.create POST /api/tasks", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ task: { id: "t1" } }) } as any);
    const { tasksApi } = await import("../api/sara-client");
    await tasksApi.create({ sessionId: "sess_abc", title: "hi" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain("/api/tasks");
  });
  
  it("sseApi.connect uses EventSource", async () => {
    const mockES = { addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn(), onmessage: null };
    function MockES() { return mockES; }
    // @ts-ignore
    global.EventSource = MockES as any;
    const { sseApi } = await import("../api/sara-client");
    const disconnect = sseApi.connect("sess_abc", () => {});
    disconnect();
    expect(mockES.close).toHaveBeenCalled();
  });
  
  it("useTasksRealtime types", async () => { const m = await import("./useTaskStream"); expect(typeof m.useTaskStream).toBe("function"); });
  it("useTasks hook exports", async () => { const m = await import("./useTasks"); expect(typeof m.useTasks).toBe("function"); });
  it("useTask hook exports", async () => { const m = await import("./useTask"); expect(typeof m.useTask).toBe("function"); });
  it("useTaskCounts exports", async () => { const m = await import("./useTaskCounts"); expect(typeof m.useTaskCounts).toBe("function"); });
});