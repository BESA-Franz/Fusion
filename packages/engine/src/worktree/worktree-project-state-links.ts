import { lstat, mkdir, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export type WorktreeProjectStateLinkOptions = {
  rootDir: string;
  worktreePath: string;
  taskId?: string;
  logger?: { log?: (message: string) => void; warn?: (message: string) => void };
};

/**
 * Make the read-only project-memory surfaces visible from an isolated task
 * worktree without copying Fusion's control-plane database or task records.
 *
 * Agents still should use fn_memory_search/fn_memory_get. The links are a
 * compatibility guard for generic file tools that resolve `.fusion/memory/*`
 * relative to their current worktree.
 */
export async function ensureWorktreeProjectStateLinks(options: WorktreeProjectStateLinkOptions): Promise<void> {
  const rootDir = resolve(options.rootDir);
  const worktreePath = resolve(options.worktreePath);
  if (rootDir === worktreePath) return;

  const sourceMemoryDir = join(rootDir, ".fusion", "memory");
  if (!existsSync(sourceMemoryDir)) return;

  const worktreeFusionDir = join(worktreePath, ".fusion");
  try {
    const fusionStat = await lstat(worktreeFusionDir);
    if (!fusionStat.isDirectory() || fusionStat.isSymbolicLink()) {
      options.logger?.warn?.(`${options.taskId ?? "worktree"}: refusing to use non-directory .fusion control surface`);
      return;
    }
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code !== "ENOENT") throw error;
    await mkdir(worktreeFusionDir, { recursive: false });
  }

  for (const name of ["memory", "agent-memory"] as const) {
    const source = join(rootDir, ".fusion", name);
    if (!existsSync(source)) continue;
    const target = join(worktreeFusionDir, name);
    try {
      await lstat(target);
      continue;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
      if (code !== "ENOENT") throw error;
    }

    try {
      await symlink(source, target, process.platform === "win32" ? "junction" : "dir");
      options.logger?.log?.(`${options.taskId ?? "worktree"}: linked project ${name} into isolated worktree`);
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
      if (code === "EEXIST") continue;
      options.logger?.warn?.(`${options.taskId ?? "worktree"}: could not link project ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
