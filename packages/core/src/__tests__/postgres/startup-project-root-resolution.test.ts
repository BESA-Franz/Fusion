import { describe, expect, it, vi } from "vitest";
import { resolveProjectRootForBackend } from "../../postgres/startup-factory.js";

function migrationDb(rows: Array<{ path: string }> = []) {
  return {
    execute: vi.fn(async () => rows),
  };
}

describe("startup-factory projectId-only root resolution", () => {
  it("resolves a registered project path before constructing a projectId-bound store", async () => {
    const db = migrationDb([{ path: "C:\\BESA\\besa-suite" }]);

    await expect(resolveProjectRootForBackend(
      db as never,
      "",
      "proj_f2c9d44f12524e93",
    )).resolves.toBe("C:\\BESA\\besa-suite");
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it("keeps an explicit root authoritative without consulting the registry", async () => {
    const db = migrationDb([{ path: "C:\\wrong" }]);

    await expect(resolveProjectRootForBackend(
      db as never,
      "C:\\BESA\\explicit",
      "proj_f2c9d44f12524e93",
    )).resolves.toBe("C:\\BESA\\explicit");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("preserves the existing not-found path when the id is not registered", async () => {
    const db = migrationDb();

    await expect(resolveProjectRootForBackend(
      db as never,
      "",
      "proj_ffffffffffffffff",
    )).resolves.toBe("");
  });
});
