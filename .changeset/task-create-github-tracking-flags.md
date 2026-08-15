---
"@runfusion/fusion": minor
---

summary: Task creation now accepts per-task GitHub tracking overrides (fn_task_create params and `fn task create --github`).
category: feature
dev: New `github_tracking`/`github_repo` params on fn_task_create and `--github`/`--no-github`/`--github-repo` flags on `fn task create`. CLI create now also applies the project/global "tracking enabled by default" setting it previously ignored; explicit disables persist `githubTracking.enabled:false`.
