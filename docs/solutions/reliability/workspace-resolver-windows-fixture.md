# Workspace resolver Windows fixture

The workspace package resolver test matched a mocked `package.json` path with POSIX separators only. On Windows the production `join` call correctly emits backslashes, so the fixture rejected the valid dashboard package before the resolver contract could be asserted.

The mock now normalizes separators before matching. This keeps the production resolver unchanged and allows the complete merger verification file to run cross-platform.
