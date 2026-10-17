import { afterEach, describe, expect, it } from "vitest";
import { executeTool } from "./file-tools";

const previousCommandSetting = process.env.MCP_ENABLE_RUN_COMMAND;

afterEach(() => {
  if (previousCommandSetting === undefined) delete process.env.MCP_ENABLE_RUN_COMMAND;
  else process.env.MCP_ENABLE_RUN_COMMAND = previousCommandSetting;
});

describe("local agent command tool", () => {
  it("denies commands unless the command feature is enabled", async () => {
    delete process.env.MCP_ENABLE_RUN_COMMAND;
    await expect(executeTool("run_command", { command: "git status" })).rejects.toThrow(/Command denied/);
  });

  it("does not interpret shell operators", async () => {
    process.env.MCP_ENABLE_RUN_COMMAND = "true";
    await expect(executeTool("run_command", { command: "git status; echo unsafe" })).rejects.toThrow(/Command denied/);
  });
});
