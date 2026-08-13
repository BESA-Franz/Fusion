/**
 * Quote one argument for the shell used by child_process.exec().
 *
 * FNXC:WindowsGitShellArguments 2026-08-13-15:16:
 * POSIX single quotes are ordinary characters in cmd.exe. Fusion therefore
 * passed quotes into Git refs and grep patterns on Windows, making recovery
 * commands fail with "ambiguous argument". Use Windows command-line quoting
 * there while preserving the existing POSIX behavior everywhere else.
 */
export function shellQuote(value: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== "win32") {
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  let quoted = '"';
  let backslashes = 0;
  for (const character of value) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      quoted += "\\".repeat(backslashes * 2 + 1);
      quoted += character;
    } else {
      quoted += "\\".repeat(backslashes);
      quoted += character;
    }
    backslashes = 0;
  }
  quoted += "\\".repeat(backslashes * 2);
  return `${quoted}"`;
}
