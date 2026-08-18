/** Quote one argument for commands executed by the native backend shell. */
export function quoteShellArg(value: string): string {
  /*
  FNXC:ExecutorShellQuoteWindows 2026-08-18-19:13:
  Worktree dependency import and remote refresh run through cmd.exe on Windows,
  where POSIX single quotes become ref characters. Preserve POSIX escaping on Unix
  and use backend-compatible double quotes on Windows.
  */
  return process.platform === "win32" ? JSON.stringify(value) : `'${value.replace(/'/g, "'\\''")}'`;
}
