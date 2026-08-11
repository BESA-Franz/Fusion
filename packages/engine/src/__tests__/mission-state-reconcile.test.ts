import { describe, expect, it, vi } from "vitest";
import { reconcileMissionState } from "../missions/mission-state-reconcile.js";

describe("reconcileMissionState", () => {
  it("retains the orthogonal alignment projection when lifecycle status is already current", async () => {
    const task = {
      id: "FN-1", title: "Delivery", column: "in-progress", status: "in-progress",
      missionId: "M-1", sliceId: "SL-1", updatedAt: "2026-08-11T00:00:00.000Z",
    };
    const feature = {
      id: "F-1", title: "Delivery", sliceId: "SL-1", taskId: "FN-1", status: "in-progress",
      specAlignment: "on-plan", createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z",
    };
    const updateFeature = vi.fn().mockResolvedValue(feature);
    const missionStore = {
      listMissions: vi.fn().mockResolvedValue([{ id: "M-1", status: "active" }]),
      getMissionWithHierarchy: vi.fn().mockResolvedValue({
        id: "M-1", milestones: [{ slices: [{ id: "SL-1", features: [feature] }] }],
      }),
      listAssertionsForFeature: vi.fn().mockResolvedValue([]),
      updateFeatureStatus: vi.fn(),
      updateFeature,
    };
    const taskStore = {
      listTasks: vi.fn().mockResolvedValue([task]),
      getTask: vi.fn().mockResolvedValue(task),
      getLatestSpecDriftReport: vi.fn().mockResolvedValue({ alignment: "diverged-needs-review" }),
    };

    await reconcileMissionState({ taskStore: taskStore as never, missionStore }, { source: "self-healing" });

    expect(missionStore.updateFeatureStatus).not.toHaveBeenCalled();
    expect(updateFeature).toHaveBeenCalledWith(
      "F-1",
      { specAlignment: "diverged-needs-review" },
      { actor: { type: "system", id: "mission-reconcile", source: "mission-reconcile:self-healing" } },
    );
  });

  it("does not title-link a task when duplicate features make ownership ambiguous", async () => {
    const task = {
      id: "FN-1", title: "Delivery", column: "in-progress", status: "in-progress",
      missionId: "M-1", sliceId: "SL-1", updatedAt: "2026-08-11T00:00:00.000Z",
    };
    const features = ["F-1", "F-2"].map((id) => ({
      id, title: "Delivery", sliceId: "SL-1", status: "defined",
      createdAt: "2026-08-11T00:00:00.000Z", updatedAt: "2026-08-11T00:00:00.000Z",
    }));
    const linkFeatureToTask = vi.fn();
    const missionStore = {
      listMissions: vi.fn().mockResolvedValue([{ id: "M-1", status: "active" }]),
      getMissionWithHierarchy: vi.fn().mockResolvedValue({
        id: "M-1", milestones: [{ slices: [{ id: "SL-1", features }] }],
      }),
      linkFeatureToTask,
      updateFeatureStatus: vi.fn(),
    };
    const taskStore = {
      listTasks: vi.fn().mockResolvedValue([task]),
      getLatestSpecDriftReport: vi.fn().mockResolvedValue(undefined),
    };

    await reconcileMissionState({ taskStore: taskStore as never, missionStore }, { source: "task-move" });

    expect(linkFeatureToTask).not.toHaveBeenCalled();
  });
});
