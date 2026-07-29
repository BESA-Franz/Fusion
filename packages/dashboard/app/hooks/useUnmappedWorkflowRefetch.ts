import { useCallback, useEffect, useRef } from "react";
import type { BoardWorkflowsPayload } from "../api";
import type { Task } from "@fusion/core";

/*
FNXC:WorkflowBoard 2026-07-29-00:00 (U12):
EXTRACTED VERBATIM from Board, so ListView can use the same self-heal instead of
growing a second copy of it. Behaviour is unchanged — the bodies below are Board's,
moved; only the surrounding parameters are new.

The original notes, preserved because they are the reason every line here exists:

  FNXC:WorkflowBoard 2026-07-05-14:20:
  Invariant: every rendered task must resolve to its REAL workflow, or the board
  silently drops it. A task created into a workflow whose intake column differs from
  the default (e.g. Coding (Ideas) -> "ideas", per FN-7591) disappears until the next
  mount/focus/workflow-CRUD refetch. Cause: the task list (SSE) updates before the
  board-workflows `taskWorkflowIds` map, so the effective workflow falls back to
  `defaultWorkflowId`, whose columns do not declare the intake column. Fix at the
  invariant, not the create surface: whenever a rendered task is absent from
  `taskWorkflowIds`, force ONE board-workflows refetch so its persisted workflow
  selection (and intake column) resolves. Signature-guarded on the sorted unmapped-id
  set so we never spin an infinite refetch loop, and only run once the payload loaded.

  The refetch is deferred by one macrotask and re-checked against the latest state at
  fire time: a surface's own quick-create commits the new task one microtask before the
  optimistic workflow seed lands, so a synchronous refetch would double-fire alongside
  the optimistic path. Deferring lets the seed land first.

  FNXC:WorkflowBoard 2026-07-12-23:40:
  The FN-7591 refetch must also fire for a PRESENT-but-unrepresentable mapping, not
  only an absent one. The server emits a `taskWorkflowIds` entry for every task
  (defaulting to the default workflow), so a stale selection row makes e.g. an
  "ideas"-column card map to plain Coding — an entry that exists but whose workflow
  does not declare the task's column. The `=== undefined` guard alone never re-fired
  for those, leaving the card permanently invisible in the aggregate view. A mapping is
  "suspect" when the resolved workflow's column set does not contain the task's stored
  column. The signature guard still prevents refetch loops for mappings that stay wrong
  after a fresh fetch.
*/
/** Attempts allowed per unresolved signature before the repair gives up. Two covers
 *  the fetch-races-the-selection-write case without permitting a refetch loop. */
const MAX_ATTEMPTS_PER_SIGNATURE = 2;

export function useUnmappedWorkflowRefetch(params: {
  boardWorkflows: BoardWorkflowsPayload | null;
  tasks: readonly Task[];
  workflowMode: boolean;
  refreshBoardWorkflows: (options?: { forceFresh?: boolean }) => void;
}): void {
  const { boardWorkflows, tasks, workflowMode, refreshBoardWorkflows } = params;

  const boardWorkflowsRef = useRef(boardWorkflows);
  boardWorkflowsRef.current = boardWorkflows;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const lastUnmappedTaskSignatureRef = useRef<string | null>(null);
  const signatureAttemptsRef = useRef(0);
  const unmappedRefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTaskWorkflowMappingSuspect = useCallback((
    payload: NonNullable<typeof boardWorkflows>,
    task: Task,
  ): boolean => {
    const assigned = payload.taskWorkflowIds[task.id];
    if (assigned === undefined) return true;
    const known = payload.workflows.some((workflow) => workflow.id === assigned);
    const workflowId = known ? assigned : payload.defaultWorkflowId;
    const workflow = payload.workflows.find((candidate) => candidate.id === workflowId);
    return workflow !== undefined && !workflow.columns.some((column) => column.id === task.column);
  }, []);

  useEffect(() => {
    if (!boardWorkflows || !workflowMode) return;
    const unmapped = tasks
      .filter((task) => isTaskWorkflowMappingSuspect(boardWorkflows, task))
      .map((task) => task.id)
      .sort();
    if (unmapped.length === 0) {
      lastUnmappedTaskSignatureRef.current = null;
      signatureAttemptsRef.current = 0;
      return;
    }
    const signature = unmapped.join(",");
    /*
    FNXC:WorkflowBoard 2026-07-29-00:00 (PR #2530 review — greptile):
    BOUNDED RETRY, not one-shot. The guard used to refuse any second attempt at the same
    signature, which is the right instinct — a mapping that stays wrong after a fresh
    fetch must not spin — but it also lost a real race: the forced fetch can return
    BEFORE the workflow-selection write commits, so it legitimately reports the same
    suspect set, and the card was then stuck with approximate metadata until an
    unrelated focus, SSE or user action refreshed workflows.

    Allowing a small fixed number of attempts per signature survives that race while
    keeping the loop protection: a genuinely-unresolvable mapping still stops after
    MAX_ATTEMPTS_PER_SIGNATURE instead of refetching forever. The counter resets
    whenever the signature changes or the board becomes healthy.

    This tightens Board as well as List, since both now share this hook. That is
    intentional — Board had the identical race.
    */
    if (signature === lastUnmappedTaskSignatureRef.current) {
      if (signatureAttemptsRef.current >= MAX_ATTEMPTS_PER_SIGNATURE) return;
    } else {
      lastUnmappedTaskSignatureRef.current = signature;
      signatureAttemptsRef.current = 0;
    }
    signatureAttemptsRef.current += 1;
    if (unmappedRefetchTimerRef.current) clearTimeout(unmappedRefetchTimerRef.current);
    unmappedRefetchTimerRef.current = setTimeout(() => {
      unmappedRefetchTimerRef.current = null;
      const latestWorkflows = boardWorkflowsRef.current;
      if (!latestWorkflows) return;
      const stillUnmapped = tasksRef.current.some((task) => isTaskWorkflowMappingSuspect(latestWorkflows, task));
      if (stillUnmapped) refreshBoardWorkflows({ forceFresh: true });
    }, 0);
  }, [boardWorkflows, isTaskWorkflowMappingSuspect, refreshBoardWorkflows, tasks, workflowMode]);

  useEffect(() => () => {
    if (unmappedRefetchTimerRef.current) clearTimeout(unmappedRefetchTimerRef.current);
  }, []);
}
