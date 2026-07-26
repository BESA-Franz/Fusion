import { randomUUID } from "node:crypto";
import { count, eq, desc, and } from "drizzle-orm";
import type { Database } from "./db.js";
import { fromJson, toJsonNullable } from "./db.js";
import type { AsyncDataLayer } from "./postgres/data-layer.js";
import * as asyncApprovalRequestStore from "./async-approval-request-store.js";
import * as schema from "./postgres/schema/index.js";
// FNXC:ApprovalLifecycleSecurity 2026-07-26-12:15:
// isApprovalRequestExpired is imported from types/agents.js directly because the types.ts pass-through
// barrel re-exports names explicitly (no `export *`); the barrel is out of this change's file scope.
import { isApprovalRequestExpired } from "./types/agents.js";
import {
  isValidApprovalRequestTransition,
  normalizeApprovalRequestActionCategory,
  type ApprovalRequest,
  type ApprovalRequestActorSnapshot,
  type ApprovalRequestAuditEvent,
  type ApprovalRequestAuditEventType,
  type ApprovalRequestCompletionInput,
  type ApprovalRequestCreateInput,
  type ApprovalRequestDecisionInput,
  type ApprovalRequestListInput,
  type ApprovalRequestStatus,
} from "./types.js";

interface ApprovalRequestRow {
  id: string;
  status: ApprovalRequestStatus;
  requesterActorId: string;
  requesterActorType: ApprovalRequestActorSnapshot["actorType"];
  requesterActorName: string;
  targetActionCategory: string;
  targetActionOperation: string;
  targetActionSummary: string;
  targetResourceType: string;
  targetResourceId: string;
  targetContext: string | null;
  taskId: string | null;
  runId: string | null;
  requestedAt: string;
  decidedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApprovalRequestAuditEventRow {
  id: string;
  requestId: string;
  eventType: ApprovalRequestAuditEventType;
  actorId: string;
  actorType: ApprovalRequestActorSnapshot["actorType"];
  actorName: string;
  note: string | null;
  createdAt: string;
}

export class ApprovalRequestStore {
  /**
   * FNXC:ApprovalRequestStore 2026-06-24-21:15:
   * When non-null, the store is in backend (PostgreSQL) mode and all data
   * access delegates to the async helpers. The sync db is unused in this mode.
   */
  private readonly asyncLayer: AsyncDataLayer | null;

  constructor(
    private db: Database | null,
    options?: { asyncLayer?: AsyncDataLayer | null },
  ) {
    this.asyncLayer = options?.asyncLayer ?? null;
  }

  /** True when the store is backed by PostgreSQL (AsyncDataLayer present). */
  private get backendMode(): boolean {
    return this.asyncLayer !== null;
  }

  /**
   * FNXC:ApprovalRequestStore 2026-06-24-21:20:
   * Asserts the sync SQLite database is available. In backend mode this is
   * never called (the async branch returns first); in SQLite mode the db is
   * always provided at construction.
   */
  private syncDb(): Database {
    if (!this.db) {
      throw new Error("ApprovalRequestStore: sync Database is null (backend mode requires asyncLayer)");
    }
    return this.db;
  }

  private rowToRequest(row: ApprovalRequestRow): ApprovalRequest {
    return {
      id: row.id,
      status: row.status,
      requester: {
        actorId: row.requesterActorId,
        actorType: row.requesterActorType,
        actorName: row.requesterActorName,
      },
      targetAction: {
        category: normalizeApprovalRequestActionCategory(
          row.targetActionCategory as Parameters<typeof normalizeApprovalRequestActionCategory>[0],
        ),
        action: row.targetActionOperation,
        summary: row.targetActionSummary,
        resourceType: row.targetResourceType,
        resourceId: row.targetResourceId,
        context: fromJson<Record<string, unknown>>(row.targetContext),
      },
      taskId: row.taskId ?? undefined,
      runId: row.runId ?? undefined,
      requestedAt: row.requestedAt,
      decidedAt: row.decidedAt ?? undefined,
      completedAt: row.completedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private rowToAuditEvent(row: ApprovalRequestAuditEventRow): ApprovalRequestAuditEvent {
    return {
      id: row.id,
      requestId: row.requestId,
      eventType: row.eventType,
      actor: {
        actorId: row.actorId,
        actorType: row.actorType,
        actorName: row.actorName,
      },
      note: row.note ?? undefined,
      createdAt: row.createdAt,
    };
  }

  private appendAuditEvent(
    requestId: string,
    eventType: ApprovalRequestAuditEventType,
    actor: ApprovalRequestActorSnapshot,
    createdAt: string,
    note?: string,
  ): ApprovalRequestAuditEvent {
    const event: ApprovalRequestAuditEvent = {
      id: `aprevt-${randomUUID().slice(0, 8)}`,
      requestId,
      eventType,
      actor,
      ...(note !== undefined ? { note } : {}),
      createdAt,
    };

    this.syncDb().prepare(`
      INSERT INTO approval_request_audit_events (id, requestId, eventType, actorId, actorType, actorName, note, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.requestId,
      event.eventType,
      event.actor.actorId,
      event.actor.actorType,
      event.actor.actorName,
      event.note ?? null,
      event.createdAt,
    );

    return event;
  }

  async create(input: ApprovalRequestCreateInput): Promise<ApprovalRequest> {
    const now = new Date().toISOString();
    const request: ApprovalRequest = {
      id: `apr-${randomUUID().slice(0, 8)}`,
      status: "pending",
      requester: input.requester,
      targetAction: {
        ...input.targetAction,
        category: normalizeApprovalRequestActionCategory(input.targetAction.category),
      },
      taskId: input.taskId,
      runId: input.runId,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    if (this.backendMode) {
      const id = `apr-${randomUUID().slice(0, 8)}`;
      return asyncApprovalRequestStore.createApprovalRequest(this.asyncLayer!, { ...input, id });
    }

    this.syncDb().transaction(() => {
      this.syncDb().prepare(`
        INSERT INTO approval_requests (
          id, status,
          requesterActorId, requesterActorType, requesterActorName,
          targetActionCategory, targetActionOperation, targetActionSummary,
          targetResourceType, targetResourceId, targetContext,
          taskId, runId,
          requestedAt, decidedAt, completedAt,
          createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        request.id,
        request.status,
        request.requester.actorId,
        request.requester.actorType,
        request.requester.actorName,
        request.targetAction.category,
        request.targetAction.action,
        request.targetAction.summary,
        request.targetAction.resourceType,
        request.targetAction.resourceId,
        toJsonNullable(request.targetAction.context),
        request.taskId ?? null,
        request.runId ?? null,
        request.requestedAt,
        null,
        null,
        request.createdAt,
        request.updatedAt,
      );
      this.appendAuditEvent(request.id, "created", input.requester, now);
    });

    this.syncDb().bumpLastModified();
    return request;
  }

  async get(id: string): Promise<ApprovalRequest | null> {
    if (this.backendMode) {
      return asyncApprovalRequestStore.getApprovalRequest(this.asyncLayer!.db, id);
    }
    const row = this.syncDb().prepare(`SELECT * FROM approval_requests WHERE id = ?`).get(id) as ApprovalRequestRow | undefined;
    return row ? this.rowToRequest(row) : null;
  }

  async list(input: ApprovalRequestListInput = {}): Promise<ApprovalRequest[]> {
    if (this.backendMode) {
      return asyncApprovalRequestStore.listApprovalRequests(this.asyncLayer!.db, input);
    }
    const where: string[] = [];
    const params: Array<string | number> = [];

    if (input.status) {
      where.push("status = ?");
      params.push(input.status);
    }
    if (input.requesterActorId) {
      where.push("requesterActorId = ?");
      params.push(input.requesterActorId);
    }
    if (input.taskId) {
      where.push("taskId = ?");
      params.push(input.taskId);
    }
    if (input.runId) {
      where.push("runId = ?");
      params.push(input.runId);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;
    const rows = this.syncDb().prepare(`
      SELECT * FROM approval_requests
      ${whereSql}
      ORDER BY createdAt DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as ApprovalRequestRow[];

    return rows.map((row) => this.rowToRequest(row));
  }

  async getPendingCountsByActor(): Promise<Map<string, number>> {
    if (this.backendMode) {
      const table = schema.project.approvalRequests;
      const rows = await this.asyncLayer!.db
        .select({
          actorId: table.requesterActorId,
          requestCount: count(),
        })
        .from(table)
        .where(eq(table.status, "pending"))
        .groupBy(table.requesterActorId);
      return new Map(rows.map((row) => [row.actorId, Number(row.requestCount)]));
    }
    const rows = this.syncDb().prepare(`
      SELECT requesterActorId AS actorId, COUNT(*) AS requestCount
      FROM approval_requests
      WHERE status = 'pending'
      GROUP BY requesterActorId
    `).all() as Array<{ actorId: string; requestCount: number }>;

    return new Map(rows.map((row) => [row.actorId, Number(row.requestCount)]));
  }

  async findLatestByDedupeKey(input: { requesterActorId: string; taskId?: string; dedupeKey: string }): Promise<ApprovalRequest | null> {
    if (this.backendMode) {
      const table = schema.project.approvalRequests;
      const conditions = [eq(table.requesterActorId, input.requesterActorId)];
      if (input.taskId !== undefined) {
        conditions.push(eq(table.taskId, input.taskId));
      }
      const rows = await this.asyncLayer!.db
        .select()
        .from(table)
        .where(and(...conditions))
        .orderBy(desc(table.createdAt), desc(table.id));
      for (const row of rows as ApprovalRequestRow[]) {
        const context = fromJson<Record<string, unknown>>(row.targetContext);
        if (context?.approvalDedupeKey === input.dedupeKey) {
          return this.rowToRequest(row);
        }
      }
      return null;
    }

    const where = ["requesterActorId = ?"];
    const params: Array<string> = [input.requesterActorId];

    if (input.taskId !== undefined) {
      where.push("taskId = ?");
      params.push(input.taskId);
    }

    const rows = this.syncDb().prepare(`
      SELECT * FROM approval_requests
      WHERE ${where.join(" AND ")}
      ORDER BY createdAt DESC, id DESC
    `).all(...params) as ApprovalRequestRow[];

    for (const row of rows) {
      const context = fromJson<Record<string, unknown>>(row.targetContext);
      if (context?.approvalDedupeKey === input.dedupeKey) {
        return this.rowToRequest(row);
      }
    }

    return null;
  }

  async decide(requestId: string, status: "approved" | "denied", input: ApprovalRequestDecisionInput): Promise<ApprovalRequest> {
    if (this.backendMode) {
      return asyncApprovalRequestStore.decideApprovalRequest(this.asyncLayer!, requestId, status, input);
    }

    /*
    FNXC:ApprovalLifecycleSecurity 2026-07-26-12:20:
    Read-validate-update must be atomic. The previous shape read the row OUTSIDE the transaction, so
    concurrent approve+deny both validated against "pending" and the last write won, silently rewriting the
    decision. Fix: re-read + re-validate INSIDE the transaction callback (synchronous prepared statements —
    this.get() is async and unusable here), then a guarded UPDATE (`WHERE id = ? AND status = ?`) whose
    changes count proves nobody raced between the read and the write. 0 changes -> invalid-transition error
    (dashboard maps that message to HTTP 409). Expired pending rows are rejected here too (lazy TTL, no
    schema change).
    */
    const now = new Date().toISOString();
    this.syncDb().transaction(() => {
      const row = this.syncDb().prepare(`SELECT * FROM approval_requests WHERE id = ?`).get(requestId) as
        | ApprovalRequestRow
        | undefined;
      if (!row) {
        throw new Error(`Approval request ${requestId} not found`);
      }
      const current = this.rowToRequest(row);
      if (!isValidApprovalRequestTransition(current.status, status)) {
        throw new Error(`Invalid approval request transition: ${current.status} -> ${status}`);
      }
      if (current.status === "pending" && isApprovalRequestExpired(current)) {
        throw new Error(`Approval request ${requestId} expired`);
      }
      const result = this.syncDb().prepare(`
        UPDATE approval_requests
        SET status = ?, decidedAt = ?, updatedAt = ?
        WHERE id = ? AND status = ?
      `).run(status, now, now, requestId, current.status);
      if (Number(result.changes) === 0) {
        throw new Error(`Invalid approval request transition: ${current.status} -> ${status}`);
      }
      this.appendAuditEvent(requestId, status, input.actor, now, input.note);
    });

    this.syncDb().bumpLastModified();
    const updated = await this.get(requestId);
    if (!updated) {
      throw new Error(`Approval request ${requestId} not found after update`);
    }
    return updated;
  }

  async markCompleted(requestId: string, input: ApprovalRequestCompletionInput): Promise<ApprovalRequest> {
    if (this.backendMode) {
      return asyncApprovalRequestStore.markApprovalRequestCompleted(this.asyncLayer!, requestId, input);
    }

    /*
    FNXC:ApprovalLifecycleSecurity 2026-07-26-12:20:
    Same atomic read-validate-update shape as decide(): re-read + validate inside the transaction, guarded
    UPDATE on the observed status, 0 changes -> conflict. Additionally:
    - Ownership: when expectedRequesterActorId is provided it must match the row's requester actorId —
      previously any runtime holding a request id could burn another agent's approval.
    - Expiry: an approved grant is redeemable only within APPROVAL_REQUEST_GRANT_TTL_MS of decidedAt
      (live DB had 17 approved / 0 completed grants redeemable forever).
    */
    const now = new Date().toISOString();
    this.syncDb().transaction(() => {
      const row = this.syncDb().prepare(`SELECT * FROM approval_requests WHERE id = ?`).get(requestId) as
        | ApprovalRequestRow
        | undefined;
      if (!row) {
        throw new Error(`Approval request ${requestId} not found`);
      }
      const current = this.rowToRequest(row);
      if (!isValidApprovalRequestTransition(current.status, "completed")) {
        throw new Error(`Invalid approval request transition: ${current.status} -> completed`);
      }
      if (
        input.expectedRequesterActorId !== undefined &&
        input.expectedRequesterActorId !== current.requester.actorId
      ) {
        throw new Error(`Approval request ${requestId} requester mismatch`);
      }
      if (current.status === "approved" && isApprovalRequestExpired(current)) {
        throw new Error(`Approval request ${requestId} expired`);
      }
      const result = this.syncDb().prepare(`
        UPDATE approval_requests
        SET status = 'completed', completedAt = ?, updatedAt = ?
        WHERE id = ? AND status = ?
      `).run(now, now, requestId, current.status);
      if (Number(result.changes) === 0) {
        throw new Error(`Invalid approval request transition: ${current.status} -> completed`);
      }
      this.appendAuditEvent(requestId, "completed", input.actor, now, input.note);
    });

    this.syncDb().bumpLastModified();
    const updated = await this.get(requestId);
    if (!updated) {
      throw new Error(`Approval request ${requestId} not found after completion`);
    }
    return updated;
  }

  async getAuditHistory(requestId: string): Promise<ApprovalRequestAuditEvent[]> {
    if (this.backendMode) {
      return asyncApprovalRequestStore.getApprovalAuditHistory(this.asyncLayer!.db, requestId);
    }
    const rows = this.syncDb().prepare(`
      SELECT * FROM approval_request_audit_events
      WHERE requestId = ?
      ORDER BY createdAt ASC, rowid ASC
    `).all(requestId) as ApprovalRequestAuditEventRow[];

    return rows.map((row) => this.rowToAuditEvent(row));
  }
}
