import { describe, it, expect, vi } from "vitest";
import { completeStartupPhaseWithinBudget, phaseTime } from "../startup-phase.js";

describe("phaseTime", () => {
  it("logs duration on success", async () => {
    const log = vi.fn();
    const result = await phaseTime("demo", async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    }, log, "test");

    expect(result).toBe(42);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatch(/^startup phase demo: \d+ms$/);
    expect(log.mock.calls[0][1]).toBe("test");
  });

  it("logs duration when the phase throws", async () => {
    const log = vi.fn();
    await expect(
      phaseTime("boom", async () => {
        throw new Error("nope");
      }, log),
    ).rejects.toThrow("nope");

    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toMatch(/^startup phase boom: \d+ms$/);
  });
});

describe("completeStartupPhaseWithinBudget", () => {
  it("completes a fast non-critical phase before the budget", async () => {
    const log = vi.fn();
    await expect(
      completeStartupPhaseWithinBudget("cache", async () => undefined, 50, log, "test"),
    ).resolves.toBe(true);
    expect(log.mock.calls.some(([message]) => String(message).startsWith("startup phase cache:"))).toBe(true);
  });

  it("defers a slow phase while observing its eventual completion", async () => {
    const log = vi.fn();
    const deferred = completeStartupPhaseWithinBudget(
      "cache",
      () => new Promise<void>((resolve) => setTimeout(resolve, 25)),
      5,
      log,
      "test",
    );

    await expect(deferred).resolves.toBe(false);
    expect(log).toHaveBeenCalledWith(
      "startup phase cache: deferred after 5ms; listener startup continues",
      "test",
    );
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(log.mock.calls.some(([message]) => String(message).match(/^startup phase cache: \d+ms$/))).toBe(true);
  });

  it("rejects invalid budgets before starting the phase", async () => {
    const log = vi.fn();
    await expect(
      completeStartupPhaseWithinBudget("cache", async () => undefined, 0, log),
    ).rejects.toThrow("positive finite number");
    expect(log).not.toHaveBeenCalled();
  });
});
