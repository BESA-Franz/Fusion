import type { TaskStore } from "@fusion/core";
import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface HydrateWorktreeDbParams {
  rootDir: string;
  worktreePath: string;
  taskId: string;
  store: Pick<TaskStore, "getTask">;
  logger: { warn: (message: string) => void };
}

export interface HydrateWorktreeDbResult {
  tasksCopied: number;
  documentsCopied: number;
  artifactsCopied: number;
  degraded: boolean;
  reason?: string;
}

/**
 * FNXC:PostgresWorktreeStorage 2026-07-14-18:35:
 * Executor worktrees share the project-scoped PostgreSQL store. Worktree
 * acquisition must never create, open, or copy a local `.fusion/fusion.db`;
 * task rows, documents, and artifacts come from the shared store and its
 * project identity. PROMPT.md remains a file-backed task contract, however, so
 * mirror that one authoritative artifact before worktree-local task reads run.
 */
export async function hydrateWorktreeDb({
  rootDir,
  worktreePath,
  taskId,
}: HydrateWorktreeDbParams): Promise<HydrateWorktreeDbResult> {
  if (rootDir === worktreePath) {
    return {
      tasksCopied: 0,
      documentsCopied: 0,
      artifactsCopied: 0,
      degraded: false,
      reason: "root_worktree",
    };
  }

  const sourcePrompt = join(rootDir, ".fusion", "tasks", taskId, "PROMPT.md");
  const destinationTaskDir = join(worktreePath, ".fusion", "tasks", taskId);
  let documentsCopied = 0;

  try {
    await mkdir(destinationTaskDir, { recursive: true });
    await copyFile(sourcePrompt, join(destinationTaskDir, "PROMPT.md"));
    documentsCopied = 1;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  return {
    tasksCopied: 0,
    documentsCopied,
    artifactsCopied: 0,
    degraded: false,
    reason: "postgres_shared_store",
  };
}
