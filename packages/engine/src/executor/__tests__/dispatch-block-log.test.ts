import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../../logger.js";
import {
  clearDispatchBlockedLogState,
  logDispatchBlockedOnce,
  resetDispatchBlockedLogState,
} from "../dispatch-block-log.js";

/*
FNXC:EngineDiagnostics 2026-08-10-08:59:
The executor's pre-dispatch gates re-run on every dispatch attempt for a blocked task and used to re-log the same
"executor dispatch blocked" line each pass, flooding the default-level TUI log pane. The invariant asserted here is
per-signature, not per-call-site: the FIRST block logs at `log()`, identical repeats drop to `debug()`, a CHANGED reason
logs again (operators must still see transitions), and clearing the state after the gate passes restores `log()` for the
next block. Both gates (unmet dependencies, ephemeral-agents-off) route through this helper.
*/
function createFakeLogger(): Logger & { log: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> } {
  return {
    log: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger & { log: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };
}

describe("logDispatchBlockedOnce", () => {
  beforeEach(() => {
    resetDispatchBlockedLogState();
  });

  it("logs the first block and demotes identical repeats to debug", () => {
    const logger = createFakeLogger();

    for (let i = 0; i < 5; i++) {
      logDispatchBlockedOnce(logger, "FN-1", "dependencies:FN-PARENT", "FN-1: blocked");
    }

    expect(logger.log).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith("FN-1: blocked");
    expect(logger.debug).toHaveBeenCalledTimes(4);
  });

  it("logs again when the block reason changes", () => {
    const logger = createFakeLogger();

    logDispatchBlockedOnce(logger, "FN-1", "dependencies:FN-A", "FN-1: blocked by FN-A");
    logDispatchBlockedOnce(logger, "FN-1", "dependencies:FN-A", "FN-1: blocked by FN-A");
    logDispatchBlockedOnce(logger, "FN-1", "dependencies:FN-B", "FN-1: blocked by FN-B");

    expect(logger.log.mock.calls.map((call) => call[0])).toEqual([
      "FN-1: blocked by FN-A",
      "FN-1: blocked by FN-B",
    ]);
  });

  it("keeps signatures per task so one blocked task does not silence another", () => {
    const logger = createFakeLogger();

    logDispatchBlockedOnce(logger, "FN-1", "ephemeral-disabled", "FN-1: blocked");
    logDispatchBlockedOnce(logger, "FN-2", "ephemeral-disabled", "FN-2: blocked");

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it("logs at default level again after the gate passes and clears the state", () => {
    const logger = createFakeLogger();

    logDispatchBlockedOnce(logger, "FN-1", "ephemeral-disabled", "FN-1: blocked");
    logDispatchBlockedOnce(logger, "FN-1", "ephemeral-disabled", "FN-1: blocked");
    clearDispatchBlockedLogState("FN-1");
    logDispatchBlockedOnce(logger, "FN-1", "ephemeral-disabled", "FN-1: blocked");

    expect(logger.log).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });
});
