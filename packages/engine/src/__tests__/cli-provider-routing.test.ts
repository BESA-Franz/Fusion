import { describe, expect, it, vi } from "vitest";
import {
  CLI_PROVIDER_ROUTING_CENSUS,
  applyCliRuntimeOptions,
  assertExplicitCliRuntimeHint,
  deriveCliRuntimeHint,
  dropUnsupportedCliFallback,
  stripCliProviderPrefix,
} from "../agents/cli-provider-routing.js";

const options = (overrides: Record<string, unknown> = {}) => ({
  defaultProvider: undefined,
  defaultModelId: undefined,
  ...overrides,
}) as never;

const runner = (available: boolean, throws = false) => ({
  getRuntimeById: vi.fn(() => {
    if (throws) throw new Error("lookup failed");
    return available ? {} : undefined;
  }),
});

describe("CLI provider routing census", () => {
  it("declares independent policies and actionable fail-fast ownership", () => {
    for (const entry of CLI_PROVIDER_ROUTING_CENSUS) {
      expect(entry.autoDerive).toBeTruthy();
      expect(entry.guardNotApplicable).toBeTruthy();
      expect(entry.onExplicitHint).toBeTruthy();
      const policies = [entry.autoDerive, entry.guardNotApplicable, entry.onExplicitHint];
      if (policies.some((policy) => policy !== "fail-fast" && policy !== "assert-available")) {
        expect(entry.rationale?.trim()).toBeTruthy();
      }
      if (policies.some((policy) => policy === "fail-fast" || policy === "assert-available")) {
        expect(Boolean(entry.missingRuntimeError) !== Boolean(entry.externalFailFastOwner)).toBe(true);
      }
    }
  });

  it.each([
    ["hermes", "hermes"],
    ["claude-cli", "claude"],
    ["omp-cli", "omp"],
  ])("derives %s and rejects absent or throwing runtime lookup", (provider, runtimeId) => {
    expect(deriveCliRuntimeHint({ runtimeOptions: options({ defaultProvider: provider }), pluginRunner: runner(true) as never, grokApiKeyVisible: false })).toBe(runtimeId);
    for (const pluginRunner of [undefined, runner(false), runner(false, true)]) {
      expect(() => deriveCliRuntimeHint({ runtimeOptions: options({ defaultProvider: provider }), pluginRunner: pluginRunner as never, grokApiKeyVisible: false })).toThrow(/runtime plugin/i);
    }
  });

  it("keeps Grok's visible-key and explicit-hint fallback policy", () => {
    expect(deriveCliRuntimeHint({ runtimeOptions: options({ defaultProvider: "grok-cli" }), pluginRunner: runner(false) as never, grokApiKeyVisible: true })).toBeUndefined();
    expect(() => assertExplicitCliRuntimeHint({ runtimeHint: "grok", runtimeOptions: options({ defaultProvider: "grok-cli" }), pluginRunner: runner(false) as never })).not.toThrow();
  });

  it("drops unresolved Claude/Hermes fallback without changing the primary", () => {
    const result = dropUnsupportedCliFallback(options({ defaultProvider: "openai", defaultModelId: "gpt", fallbackProvider: "hermes", fallbackModelId: "profile" }));
    expect(result.droppedProvider).toBe("hermes");
    expect(result.options).toMatchObject({ defaultProvider: "openai", defaultModelId: "gpt", fallbackProvider: undefined });
  });

  it("promotes OMP fallback and strips only its prefix", () => {
    expect(stripCliProviderPrefix("omp-cli", "omp-cli/model")).toBe("model");
    expect(stripCliProviderPrefix("omp-cli", "model")).toBe("model");
    expect(stripCliProviderPrefix("omp-cli", "  ")).toBe("");
    expect(applyCliRuntimeOptions(options({ defaultProvider: "openai", fallbackProvider: "omp-cli", fallbackModelId: "omp-cli/model" }), "omp")).toMatchObject({ defaultProvider: "omp-cli", defaultModelId: "model", fallbackProvider: undefined });
  });

  it("uses a provider-named Cursor failure in both injected support states", () => {
    for (const _support of [false, true]) {
      expect(() => deriveCliRuntimeHint({ runtimeOptions: options({ defaultProvider: "cursor-cli" }), pluginRunner: runner(true) as never, grokApiKeyVisible: false })).toThrow(/Cursor CLI/);
    }
  });
});
