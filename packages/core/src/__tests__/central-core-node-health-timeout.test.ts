import { afterEach, describe, expect, it, vi } from "vitest";

import { CentralCore } from "../central/central-core.js";

/**
 * FNXC:RemoteNodeHealth 2026-08-14-21:34:
 * PC1 exposed the production edge where a healthy authenticated response arrived after the former five-second cutoff.
 */
describe("CentralCore remote node health timeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps a remote node online when its authenticated health response arrives after five seconds", async () => {
    vi.useFakeTimers();

    const central = Object.create(CentralCore.prototype) as CentralCore;
    (central as unknown as { ensureInitialized: () => void }).ensureInitialized = vi.fn();
    central.getNode = vi.fn().mockResolvedValue({
      id: "node-pc1",
      name: "PC1",
      type: "remote",
      status: "online",
      url: "http://pc1.test:4040",
      apiKey: "fixture-key",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
        const responseTimer = setTimeout(() => resolve({ ok: true } as Response), 6_000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(responseTimer);
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      }))
    );

    const healthOutcome = central.checkNodeHealth("node-pc1").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(6_000);

    expect(await healthOutcome).toBe("online");
  });
});
