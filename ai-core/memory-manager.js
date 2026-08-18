/**
 * AI Core - Structured Memory Manager
 * Aislamiento estricto de memoria por cliente, asistente, área y conocimiento global.
 * Ciclo de vida: candidate -> validated -> active -> deprecated / rejected.
 */

import { defaultAuditLogger, AIEvents } from "./audit-logger.js";

export const MemoryStatus = {
  CANDIDATE: "candidate",
  VALIDATED: "validated",
  ACTIVE: "active",
  DEPRECATED: "deprecated",
  REJECTED: "rejected"
};

export class MemoryManager {
  constructor(options = {}) {
    this.memories = new Map();
    this.logger = options.logger || defaultAuditLogger;
  }

  createMemory({
    source = "conversation",
    assistantId = "crm.sales",
    conversationId = null,
    customerId = null,
    namespace = "global",
    category = "preference",
    content = "",
    summary = "",
    confidence = 0.85,
    status = MemoryStatus.CANDIDATE,
    metadata = {}
  }) {
    if (!content.trim()) {
      throw new Error("El contenido de la memoria no puede estar vacío.");
    }

    const existing = this.findSimilar(content, { customerId, namespace });
    if (existing) {
      existing.usageCount = (existing.usageCount || 1) + 1;
      existing.lastUsedAt = new Date().toISOString();
      existing.updatedAt = new Date().toISOString();
      if (confidence > existing.confidence) {
        existing.confidence = confidence;
      }
      this.logger.log(AIEvents.MEMORY_UPDATED, {
        assistantId,
        conversationId,
        customerId,
        metadata: { memoryId: existing.id, usageCount: existing.usageCount }
      });
      return existing;
    }

    const memory = {
      id: "mem_" + Math.random().toString(36).substring(2, 10),
      source,
      assistantId,
      conversationId,
      customerId,
      namespace,
      category,
      content: content.trim(),
      summary: summary.trim() || content.trim().substring(0, 100),
      confidence: Math.min(Math.max(confidence, 0.0), 1.0),
      status,
      usageCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      metadata
    };

    this.memories.set(memory.id, memory);

    this.logger.log(AIEvents.MEMORY_CREATED, {
      assistantId,
      conversationId,
      customerId,
      metadata: { memoryId: memory.id, status, confidence }
    });

    return memory;
  }

  findSimilar(text, { customerId = null, namespace = "global" } = {}) {
    const clean = text.toLowerCase().trim();
    for (const mem of this.memories.values()) {
      if (mem.status === MemoryStatus.REJECTED) continue;
      if (namespace && mem.namespace !== namespace) continue;
      if (customerId && mem.customerId !== customerId) continue;

      if (mem.content.toLowerCase().trim() === clean || (clean.length > 20 && mem.content.toLowerCase().includes(clean))) {
        return mem;
      }
    }
    return null;
  }

  getMemoriesForContext({ customerId = null, assistantId = null, namespace = null, minConfidence = 0.6, limit = 10 }) {
    const results = [];
    for (const mem of this.memories.values()) {
      if (mem.status === MemoryStatus.REJECTED || mem.status === MemoryStatus.DEPRECATED) continue;
      if (mem.confidence < minConfidence) continue;

      if (customerId && mem.customerId && mem.customerId !== customerId) continue;
      if (namespace && mem.namespace !== namespace && mem.namespace !== "global") continue;

      results.push(mem);
    }

    return results
      .sort((a, b) => (b.confidence * (b.usageCount || 1)) - (a.confidence * (a.usageCount || 1)))
      .slice(0, limit);
  }

  updateStatus(memoryId, newStatus) {
    const mem = this.memories.get(memoryId);
    if (!mem) throw new Error(`Memoria con ID '${memoryId}' no encontrada.`);
    mem.status = newStatus;
    mem.updatedAt = new Date().toISOString();

    if (newStatus === MemoryStatus.REJECTED) {
      this.logger.log(AIEvents.MEMORY_REJECTED, {
        assistantId: mem.assistantId,
        metadata: { memoryId }
      });
    } else {
      this.logger.log(AIEvents.MEMORY_UPDATED, {
        assistantId: mem.assistantId,
        metadata: { memoryId, newStatus }
      });
    }
    return mem;
  }

  listCandidates() {
    return Array.from(this.memories.values()).filter(m => m.status === MemoryStatus.CANDIDATE);
  }

  listActive() {
    return Array.from(this.memories.values()).filter(m => m.status === MemoryStatus.ACTIVE || m.status === MemoryStatus.VALIDATED);
  }
}

export const defaultMemoryManager = new MemoryManager();
