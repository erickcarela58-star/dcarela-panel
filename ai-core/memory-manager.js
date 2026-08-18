/**
 * AI Core - Structured Memory Manager
 * Aislamiento estricto de memoria por cliente, asistente, área y conocimiento global.
 * Ciclo de vida: candidate -> validated -> active -> deprecated / rejected.
 * Persistencia en localStorage e inyección dinámica al prompt.
 */

import { defaultAuditLogger, AIEvents } from "./audit-logger.js";

export const MemoryStatus = {
  CANDIDATE: "candidate",
  VALIDATED: "validated",
  ACTIVE: "active",
  DEPRECATED: "deprecated",
  REJECTED: "rejected"
};

const STORAGE_KEY = "dcarela.ia.memory.v2";

export class MemoryManager {
  constructor(options = {}) {
    this.memories = new Map();
    this.logger = options.logger || defaultAuditLogger;
    this.options = options;
    this.loadFromStorage();
  }

  loadFromStorage() {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              if (item && item.id) {
                this.memories.set(item.id, item);
              }
            }
          }
        }
      }
    } catch {
      // Entornos sin localStorage o parseo inválido
    }

    // Si se solicita siembra y no hay memorias
    if (this.memories.size === 0 && this.options.seedInitial) {
      this.seedInitialKnowledge();
    }
  }

  saveToStorage() {
    try {
      if (typeof localStorage !== "undefined") {
        const list = Array.from(this.memories.values());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      }
    } catch {
      // Ignorar errores de quota de almacenamiento
    }
  }

  seedInitialKnowledge() {
    const seed = [
      {
        id: "mem_seed_comercial_rosa",
        source: "system_seed",
        assistantId: "pos_assistant",
        namespace: "finance_rules",
        category: "supplier_payment_default",
        content: "Regla de pago: 'Comercial Rosa' (papelería/suministros no fotográficos) se paga habitualmente con Tarjeta de Crédito Qik.",
        summary: "Comercial Rosa ➔ Tarjeta Qik",
        confidence: 1.0,
        status: MemoryStatus.ACTIVE,
        usageCount: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        metadata: { entity: "Comercial Rosa", method: "tarjeta" }
      },
      {
        id: "mem_seed_chatgpt_sub",
        source: "system_seed",
        assistantId: "pos_assistant",
        namespace: "finance_commitments",
        category: "recurring_service",
        content: "Compromiso mensual: 'ChatGPT' es una suscripción recurrente de US$ 28.00 vinculada a la cuenta Banco Popular.",
        summary: "ChatGPT ➔ US$28 Banco Popular",
        confidence: 1.0,
        status: MemoryStatus.ACTIVE,
        usageCount: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        metadata: { serviceName: "ChatGPT", amountUsd: 28, account: "Banco Popular" }
      },
      {
        id: "mem_seed_itbis_rule",
        source: "system_seed",
        assistantId: "pos_assistant",
        namespace: "fiscal_rules",
        category: "tax_standard",
        content: "Regla fiscal: Los precios en ventas se capturan con ITBIS (18%) incluido. Desglose exacto hacia atrás.",
        summary: "ITBIS 18% incluido",
        confidence: 1.0,
        status: MemoryStatus.ACTIVE,
        usageCount: 10,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastUsedAt: new Date().toISOString(),
        metadata: {}
      }
    ];

    for (const item of seed) {
      this.memories.set(item.id, item);
    }
    this.saveToStorage();
  }

  createMemory({
    source = "conversation",
    assistantId = "pos_assistant",
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
      this.saveToStorage();
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
      summary: summary.trim() || content.trim().substring(0, 80),
      confidence: Math.min(Math.max(confidence, 0.0), 1.0),
      status,
      usageCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      metadata
    };

    this.memories.set(memory.id, memory);
    this.saveToStorage();

    this.logger.log(AIEvents.MEMORY_CREATED, {
      assistantId,
      conversationId,
      customerId,
      metadata: { memoryId: memory.id, status, confidence }
    });

    return memory;
  }

  findSimilar(text, { customerId = null, namespace = null } = {}) {
    const clean = text.toLowerCase().trim();
    for (const mem of this.memories.values()) {
      if (mem.status === MemoryStatus.REJECTED) continue;
      if (namespace && mem.namespace !== namespace && mem.namespace !== "global") continue;
      if (customerId && mem.customerId !== customerId) continue;

      if (mem.content.toLowerCase().trim() === clean || (clean.length > 20 && mem.content.toLowerCase().includes(clean))) {
        return mem;
      }
    }
    return null;
  }

  getMemoriesForContext({ customerId = null, assistantId = null, namespace = null, minConfidence = 0.6, limit = 15 }) {
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

  getActiveRulesSummary() {
    const active = this.listActive();
    if (!active.length) return "";

    const lines = active.map(m => `- ${m.content}`);
    return `[REGLAS Y APRENDIZAJES OPERATIVOS ACTIVOS]:\n${lines.join("\n")}`;
  }

  updateStatus(memoryId, newStatus) {
    const mem = this.memories.get(memoryId);
    if (!mem) throw new Error(`Memoria con ID '${memoryId}' no encontrada.`);
    mem.status = newStatus;
    mem.updatedAt = new Date().toISOString();
    this.saveToStorage();

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

  deleteMemory(memoryId) {
    const deleted = this.memories.delete(memoryId);
    if (deleted) this.saveToStorage();
    return deleted;
  }

  clearAll() {
    this.memories.clear();
    this.saveToStorage();
  }

  listCandidates() {
    return Array.from(this.memories.values()).filter(m => m.status === MemoryStatus.CANDIDATE);
  }

  listActive() {
    return Array.from(this.memories.values()).filter(m => m.status === MemoryStatus.ACTIVE || m.status === MemoryStatus.VALIDATED);
  }
}

export const defaultMemoryManager = new MemoryManager({ seedInitial: true });
