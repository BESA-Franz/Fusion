---
"@runfusion/fusion": patch
"@fusion/dashboard": patch
---
summary: Expose commit-bound runtime identity and project scope in daemon health.
category: fix
dev: Local supervisors can verify the active build and project from the public liveness payload without reading credentials or process command lines.
