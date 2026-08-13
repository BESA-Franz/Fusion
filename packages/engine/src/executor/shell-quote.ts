import { shellQuote } from "../git-shell-quote.js";

/**
 * FNXC:CodeOrganization 2026-08-03-13:35:
 * Shell arg helper peeled from TaskExecutor (U4).
 *
 * FNXC:WindowsGitShellArguments 2026-08-13-18:25:
 * Executor worktree commands run through child_process.exec(), which uses
 * cmd.exe on Windows. Delegate to the shared platform-aware helper so refs
 * are not passed to Git with literal POSIX single quotes.
 */
export function quoteShellArg(
  value: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return shellQuote(value, platform);
}
