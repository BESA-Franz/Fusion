import type { PluginContext } from "@fusion/plugin-sdk";
import { taskToCard, type GlassesCard } from "./cards.js";
import { GlassesInputError } from "./quick-capture.js";

type TaskRecord = NonNullable<Awaited<ReturnType<PluginContext["taskStore"]["getTask"]>>>;

type AgentActionInput = {
  taskId: unknown;
};

type AgentActionDeps = {
  taskStore: PluginContext["taskStore"];
  pluginId: string;
  cardOptions?: unknown;
};

type AgentActionResult = {
  task: TaskRecord;
  card: GlassesCard;
};

const START_WORK_BLOCKED_STATUSES = new Set(["planning", "needs-replan", "awaiting-approval", "awaiting-user-review"]);
const RETRYABLE_FAILURE_STATUSES = new Set(["failed", "stuck-killed"]);
const RETRYABLE_TRIAGE_STATUSES = new Set(["failed", "planning", "needs-replan"]);

function normalizeTaskId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GlassesInputError(400, "taskId is required");
  }
  return value.trim();
}

async function getTaskOrThrow(taskStore: PluginContext["taskStore"], taskId: string): Promise<TaskRecord> {
  const task = await taskStore.getTask(taskId);
  if (!task) {
    throw new GlassesInputError(404, "task not found");
  }
  return task as TaskRecord;
}

function conflict(verb: string, task: { column: unknown; status?: unknown }): never {
  throw new GlassesInputError(409, `${verb} not allowed in column=${String(task.column)} status=${String(task.status ?? null)}`);
}

async function toResult(taskStore: PluginContext["taskStore"], taskId: string): Promise<AgentActionResult> {
  const task = await getTaskOrThrow(taskStore, taskId);
  return { task, card: taskToCard(task as never) };
}

export async function startWork(input: AgentActionInput, deps: AgentActionDeps): Promise<AgentActionResult> {
  const taskId = normalizeTaskId(input.taskId);
  const task = await getTaskOrThrow(deps.taskStore, taskId);
  if ((task.column !== "triage" && task.column !== "todo") || START_WORK_BLOCKED_STATUSES.has(String(task.status))) {
    conflict("start-work", task);
  }
  /*
  FNXC:GlassesAgentActions 2026-07-26-12:40:
  Glasses actions are human gestures, so board moves must carry `moveSource: "user"`
  (matching the dashboard move route). Defaulting to the engine source misattributed
  the move actor and skipped user-move semantics in the store's move pipeline.
  Exceptions below: returnToAgent/retryTask intentionally keep the default source
  because a user-source move to todo parks the task userPaused, which would defeat
  those actions' requeue-for-execution intent (dashboard rebound/retry routes use the
  default source for the same reason).
  */
  // Intentional v1 limitation: plugin cannot import engine allocator, so moveTask runs without allocateWorktree.
  await deps.taskStore.moveTask(taskId, "in-progress", { moveSource: "user" });
  return toResult(deps.taskStore, taskId);
}

export async function requestReview(input: AgentActionInput, deps: AgentActionDeps): Promise<AgentActionResult> {
  const taskId = normalizeTaskId(input.taskId);
  const task = await getTaskOrThrow(deps.taskStore, taskId);
  if (task.column !== "in-progress") {
    conflict("request-review", task);
  }
  // FNXC:GlassesAgentActions 2026-07-26-12:40: human gesture — user source (see startWork).
  await deps.taskStore.moveTask(taskId, "in-review", { moveSource: "user" });
  return toResult(deps.taskStore, taskId);
}

export async function approvePlan(input: AgentActionInput, deps: AgentActionDeps): Promise<AgentActionResult> {
  const taskId = normalizeTaskId(input.taskId);
  const task = await getTaskOrThrow(deps.taskStore, taskId);
  if (task.column !== "triage" || task.status !== "awaiting-approval") {
    conflict("approve-plan", task);
  }
  // FNXC:GlassesAgentActions 2026-07-26-12:40: human gesture — user source (see startWork).
  // triage → todo is outside the reopen set, so no userPaused park is applied here.
  await deps.taskStore.moveTask(taskId, "todo", { moveSource: "user" });
  await deps.taskStore.updateTask(taskId, { status: undefined });
  return toResult(deps.taskStore, taskId);
}

export async function acceptReview(input: AgentActionInput, deps: AgentActionDeps): Promise<AgentActionResult> {
  const taskId = normalizeTaskId(input.taskId);
  const task = await getTaskOrThrow(deps.taskStore, taskId);
  if (task.column !== "in-review") {
    conflict("accept-review", task);
  }
  await deps.taskStore.updateTask(taskId, { status: null, assigneeUserId: null });
  return toResult(deps.taskStore, taskId);
}

export async function returnToAgent(input: AgentActionInput, deps: AgentActionDeps): Promise<AgentActionResult> {
  const taskId = normalizeTaskId(input.taskId);
  const task = await getTaskOrThrow(deps.taskStore, taskId);
  if (task.column !== "in-review") {
    conflict("return-to-agent", task);
  }
  await deps.taskStore.updateTask(taskId, {
    assigneeUserId: null,
    status: null,
    assignedAgentId: null,
  });
  // FNXC:GlassesAgentActions 2026-07-26-12:40: intentionally default (engine) source:
  // a user-source in-review → todo move sets userPaused and would park the task
  // instead of returning it to the agent (mirrors dashboard rebound routes).
  await deps.taskStore.moveTask(taskId, "todo");
  return toResult(deps.taskStore, taskId);
}

export async function retryTask(input: AgentActionInput, deps: AgentActionDeps): Promise<AgentActionResult> {
  const taskId = normalizeTaskId(input.taskId);
  const task = await getTaskOrThrow(deps.taskStore, taskId);

  if (task.column === "in-review" && RETRYABLE_FAILURE_STATUSES.has(String(task.status))) {
    await deps.taskStore.updateTask(taskId, { status: null, error: null, stuckKillCount: 0, mergeRetries: 0 });
    return toResult(deps.taskStore, taskId);
  }

  if (
    task.column === "triage" &&
    (RETRYABLE_TRIAGE_STATUSES.has(String(task.status)) || (typeof task.stuckKillCount === "number" && task.stuckKillCount > 0))
  ) {
    // Intentional v1 limitation: does not delete on-disk PROMPT.md or run dashboard step-reset/branch-inspection logic.
    await deps.taskStore.updateTask(taskId, {
      status: "needs-replan",
      error: null,
      worktree: null,
      branch: null,
      baseBranch: null,
      baseCommitSha: null,
      stuckKillCount: 0,
      recoveryRetryCount: null,
      nextRecoveryAt: null,
    });
    return toResult(deps.taskStore, taskId);
  }

  if (RETRYABLE_FAILURE_STATUSES.has(String(task.status))) {
    // Intentional v1 limitation: omits dashboard retry step-reset/branch-inspection behavior.
    await deps.taskStore.updateTask(taskId, {
      status: null,
      error: null,
      worktree: null,
      branch: null,
      baseBranch: null,
      baseCommitSha: null,
      stuckKillCount: 0,
      recoveryRetryCount: null,
      nextRecoveryAt: null,
    });
    // FNXC:GlassesAgentActions 2026-07-26-12:40: intentionally default (engine) source:
    // retry requeues for execution; user source would userPaused-park the row (see returnToAgent).
    await deps.taskStore.moveTask(taskId, "todo");
    return toResult(deps.taskStore, taskId);
  }

  conflict("retry", task);
}
