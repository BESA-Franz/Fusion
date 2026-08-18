import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { defaultGitOps } from "../experiment/git-ops.js";

function createRepo() {
  const dir = mkdtempSync(join(tmpdir(), "finalize git ops "));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf-8" }).trim();
  git("init", "-q", "-b", "main");
  git("config", "core.autocrlf", "false");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(join(dir, "file.txt"), "one\n");
  git("add", "file.txt");
  git("commit", "-qm", "first");
  writeFileSync(join(dir, "file.txt"), "two\n");
  git("add", "file.txt");
  git("commit", "-qm", "second");
  return dir;
}

describe("finalize git ops", () => {
  it("supports mergeBase/branch/checkout/currentBranch/deleteBranch/cherryPick", async () => {
    const cwd = createRepo();
    try {
      const git = defaultGitOps(cwd);
      const head = await git.head();
      const initialBranch = (await git.currentBranch()) ?? "main";
      await git.createBranch("feature/a", head);
      expect(await git.branchExists("feature/a")).toBe(true);

      await git.checkout("feature/a");
      expect(await git.currentBranch()).toBe("feature/a");

      const featureFile = "feature $value `tick.txt";
      const featureMessage = "feature $value `tick";
      writeFileSync(join(cwd, featureFile), "feature\n");
      await git.add([featureFile]);
      const featureCommit = await git.commit(featureMessage);
      expect(execFileSync("git", ["log", "-1", "--format=%s", featureCommit], {
        cwd,
        encoding: "utf-8",
      }).trim()).toBe(featureMessage);

      await git.checkout(initialBranch);
      writeFileSync(join(cwd, "main.txt"), "main\n");
      await git.add(["main.txt"]);
      await git.commit("main change");

      const mergeBase = await git.mergeBase(initialBranch, "feature/a");
      expect(mergeBase).toBe(head);

      await git.checkout(initialBranch);
      await git.cherryPick(featureCommit);
      expect((await git.statusPorcelain()).trim()).toBe("");

      await git.deleteBranch("feature/a", { force: true });
      expect(await git.branchExists("feature/a")).toBe(false);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("preserves stash labels containing shell characters", async () => {
    const cwd = createRepo();
    try {
      const git = defaultGitOps(cwd);
      const label = "stash $value `tick";
      writeFileSync(join(cwd, "file.txt"), "stashed\n");

      const stashRef = await git.stashPush(label);

      expect(stashRef).toBe("stash@{0}");
      expect(execFileSync("git", ["stash", "list", "-1", "--format=%s"], {
        cwd,
        encoding: "utf-8",
      })).toContain(label);
      expect(await git.statusPorcelain()).toBe("");

      await git.stashPop(stashRef!);
      expect(await git.statusPorcelain()).toContain("file.txt");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
