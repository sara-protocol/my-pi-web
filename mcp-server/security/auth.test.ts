import { afterEach, describe, expect, it } from "vitest";
import { authMiddleware, getPrincipalFromRequest } from "./auth.js";

const originalToken = process.env.MCP_AUTH_TOKEN;

afterEach(() => {
  if (originalToken === undefined) delete process.env.MCP_AUTH_TOKEN;
  else process.env.MCP_AUTH_TOKEN = originalToken;
});

describe("MCP bearer authentication", () => {
  it("rejects missing and incorrect bearer tokens", () => {
    process.env.MCP_AUTH_TOKEN = "a-secure-test-token-123";
    expect(getPrincipalFromRequest({ headers: {} })).toBeNull();
    expect(getPrincipalFromRequest({ headers: { authorization: "Bearer wrong-token" } })).toBeNull();
  });

  it("derives a stable principal only for the configured token", () => {
    process.env.MCP_AUTH_TOKEN = "a-secure-test-token-123";
    const first = getPrincipalFromRequest({ headers: { authorization: "Bearer a-secure-test-token-123" } });
    const second = getPrincipalFromRequest({ headers: { Authorization: "Bearer a-secure-test-token-123" } });
    expect(first).not.toBeNull();
    expect(first?.id).toBe(second?.id);
    expect(first?.principalId).toBe(first?.id);
  });

  it("returns 401 without a valid token and calls next for a valid token", () => {
    process.env.MCP_AUTH_TOKEN = "a-secure-test-token-123";
    let statusCode = 0;
    const response = { status: (code: number) => { statusCode = code; return response; }, json: (_body: unknown) => undefined };
    const next = () => undefined;
    let called = false;
    authMiddleware({ headers: {} }, response, next);
    expect(called).toBe(false);
    expect(statusCode).toBe(401);

    authMiddleware(
      { headers: { authorization: "Bearer a-secure-test-token-123" } },
      response,
      () => { called = true; },
    );
    expect(called).toBe(true);
  });
});
