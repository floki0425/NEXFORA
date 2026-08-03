export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  actorType: "internal" | "client" | "system";
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogFilters {
  entityType: string;
  action: string;
  page: number;
}

export interface AuditLogPageData {
  entries: AuditLogEntry[];
  page: number;
  pageCount: number;
}
