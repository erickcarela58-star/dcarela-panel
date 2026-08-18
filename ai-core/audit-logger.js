/**
 * AI Core - Audit Logger & Observability Engine
 * Emisión de eventos estructurados para monitoreo, métricas y trazabilidad sin secretos.
 */

export const AIEvents = {
  REQUEST_STARTED: "AI_REQUEST_STARTED",
  REQUEST_COMPLETED: "AI_REQUEST_COMPLETED",
  REQUEST_FAILED: "AI_REQUEST_FAILED",
  CONVERSATION_ANALYZED: "CONVERSATION_ANALYZED",
  MEMORY_CREATED: "MEMORY_CREATED",
  MEMORY_UPDATED: "MEMORY_UPDATED",
  MEMORY_REJECTED: "MEMORY_REJECTED",
  RAG_SEARCH_STARTED: "RAG_SEARCH_STARTED",
  RAG_SEARCH_COMPLETED: "RAG_SEARCH_COMPLETED",
  ASSISTANT_CONTEXT_BUILT: "ASSISTANT_CONTEXT_BUILT",
  STYLE_CHANGED: "STYLE_CHANGED",
  COPY_MESSAGE_USED: "COPY_MESSAGE_USED",
  FEEDBACK_RECEIVED: "FEEDBACK_RECEIVED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  RATE_LIMIT_HIT: "RATE_LIMIT_HIT"
};

export class AuditLogger {
  constructor(options = {}) {
    this.logs = [];
    this.maxLogs = options.maxLogs || 500;
    this.listeners = new Set();
  }

  sanitize(payload) {
    if (!payload || typeof payload !== "object") return payload;
    const clean = Array.isArray(payload) ? [] : {};
    const forbiddenKeys = ["apiKey", "password", "token", "secret", "authorization", "cookie", "anonKey"];

    for (const [key, value] of Object.entries(payload)) {
      if (forbiddenKeys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
        clean[key] = "[REDACTED_SECRET]";
      } else if (typeof value === "object" && value !== null) {
        clean[key] = this.sanitize(value);
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }

  log(eventType, data = {}) {
    const event = {
      id: "evt_" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      eventType,
      assistantId: data.assistantId || "core",
      conversationId: data.conversationId || null,
      customerId: data.customerId || null,
      status: data.status || "INFO",
      durationMs: data.durationMs || null,
      errorCode: data.errorCode || null,
      metadata: this.sanitize(data.metadata || {})
    };

    this.logs.unshift(event);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[AuditLogger Listener Error]", err);
      }
    }
    return event;
  }

  getRecentLogs(limit = 50, filterType = null) {
    let filtered = this.logs;
    if (filterType) {
      filtered = filtered.filter(l => l.eventType === filterType);
    }
    return filtered.slice(0, limit);
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  clear() {
    this.logs = [];
  }
}

export const defaultAuditLogger = new AuditLogger();
