import { describe, expect, it, vi } from "vitest";
import { CursorRuntimeAdapter } from "../runtime-adapter.js";
import * as transport from "../prompt-transport.js";

describe("CursorRuntimeAdapter", () => {
  it("normalizes model and creates a cwd-bound session", async () => {
    const result = await new CursorRuntimeAdapter().createSession({ cwd: "/tmp", systemPrompt: "sys", defaultModelId: "cursor-cli/pro", tools: "readonly" });
    expect(result.session.model).toBe("pro");
    expect(result.session.cwd).toBe("/tmp");
    expect(result.session.tools).toBe("readonly");
    expect(new CursorRuntimeAdapter().describeModel(result.session)).toBe("cursor-cli/pro");
  });
  it("fuses the first prompt and resumes retained Cursor chat", async () => {
    const spy = vi.spyOn(transport, "launchCursorPrompt").mockResolvedValueOnce({ sessionId: "chat-1", text: "first" }).mockResolvedValueOnce({ sessionId: "chat-1", text: "second" });
    const text = vi.fn(); const adapter = new CursorRuntimeAdapter();
    const { session } = await adapter.createSession({ cwd: "/tmp", systemPrompt: "system", onText: text, tools: "readonly" });
    await adapter.promptWithFallback(session, "one"); await adapter.promptWithFallback(session, "two");
    expect(spy.mock.calls[0][0]).toMatchObject({ cwd: "/tmp", tools: "readonly", resumeId: undefined });
    expect(spy.mock.calls[0][0].prompt).toContain("system");
    expect(spy.mock.calls[1][0]).toMatchObject({ prompt: "two", resumeId: "chat-1", tools: "readonly" });
  });
  it("restores the session id on transport failure and disposal aborts an active turn exactly once", async () => {
    vi.spyOn(transport, "launchCursorPrompt").mockRejectedValueOnce(new Error("failed"));
    const adapter = new CursorRuntimeAdapter();
    const { session } = await adapter.createSession({ cwd: "/tmp", systemPrompt: "system" }); session.sessionId = "prior";
    await expect(adapter.promptWithFallback(session, "x")).rejects.toThrow("failed"); expect(session.sessionId).toBe("prior");

    let signal: AbortSignal | undefined;
    vi.spyOn(transport, "launchCursorPrompt").mockImplementationOnce((input) => new Promise((_resolve, reject) => {
      signal = input.signal;
      input.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const active = adapter.promptWithFallback(session, "active");
    session.dispose(); session.dispose();
    expect(signal?.aborted).toBe(true);
    await expect(active).rejects.toThrow("aborted");
    expect(session.activeAbortController).toBeUndefined();
  });
});
