# fusion-plugin-cursor-runtime

Cursor CLI-backed provider/runtime plugin for Fusion.

## Contract summary

- Provider ID: `cursor-cli`
- Binary probes: `cursor-agent`, then `cursor`
- Expected failure states: missing binary, missing Cursor IDE install, locked macOS keychain, unauthenticated runtime
- Model discovery: `cursor-agent models` (plain text `id - Label` output; no `--json` support) with header/tip/empty-state filtering, dedupe, and fallback metadata
- Auth status: `cursor-agent status --format json` (`isAuthenticated`), probed against the same candidate binary that succeeded `--version`

## Notes

Status/auth and model discovery behavior follows `docs/cursor-cli-contract.md`.

## External Integration Evidence

- Canonical upstream repository: Cursor CLI is closed-source and has no canonical upstream source repository. Its public issue tracker is https://github.com/cursor/cursor.
- Docs / homepage: https://cursor.com/docs/cli/overview
- Release / download: `curl https://cursor.com/install -fsS | bash` (macOS/Linux/WSL), or `irm 'https://cursor.com/install?win32=true' | iex` (Windows PowerShell).
- Binary: `cursor-agent`
- Checksum: `upstream-pending-verification`; Cursor publishes no versioned checksum manifest. Verified local provenance: `2026.08.11-e8db854` on 2026-08-15.

## Execution transport contract

Fusion runs one supervised `cursor-agent --print --output-format stream-json` turn per prompt. The prompt is supplied on stdin, the process `cwd` is the Fusion task worktree, and the init event confirmed that cwd is the Cursor workspace without a `--workspace` argument. Stream JSON emits init, thinking, assistant, tool_call, and terminal result events; session IDs are retained with `--resume` on the next turn.

| Fusion tool mode | Cursor flags |
| --- | --- |
| `coding` | `--force --trust` |
| `readonly` or unset | `--mode plan --trust` |

`--print` already grants built-in write and shell tools. `--force` controls approval, so it is limited to coding sessions whose cwd is Fusion's isolated task worktree. Fusion does not use `--auto-review`, worktree, add-dir, MCP approval, plugin-dir, or sandbox override flags. Fusion `fn_*` tools are not bridged into Cursor; Cursor uses only its own built-in tools.

All turns use `superviseSpawn` with a finite lifetime. The Windows prompt transport prefers a direct executable; `.cmd`/`.bat` shims validate and reject cmd metacharacters before a quoted cmd launch, `.ps1` uses PowerShell `-File`, and unknown extensions fail loudly. `PI_CURSOR_CLI_FIRST_LINE_TIMEOUT_MS` and `PI_CURSOR_CLI_TIMEOUT_MS` optionally tune cold-start and inactivity guards.
