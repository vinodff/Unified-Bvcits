// Audit helper (spec Section 24): every human and agent action that changes
// state is appended to the immutable audit log. Failures to audit are
// swallowed so logging never breaks publishing.

import type { StorageProvider } from "./storage";
import { newId, nowIso } from "./storage";

export async function appendAuditSafe(
  store: StorageProvider,
  actor: string,
  action: string,
  entity: string,
  entityId: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  try {
    await store.appendAudit({
      id: newId("audit"),
      at: nowIso(),
      actor,
      action,
      entity,
      entityId,
      detail,
      ip: null,
    });
  } catch {
    /* never let audit failures break the primary flow */
  }
}