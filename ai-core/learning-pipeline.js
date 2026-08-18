/**
 * AI Core - Learning Pipeline
 * Extracción controlada de hechos, consolidación de conocimiento y detección de patrones de alta confianza.
 */

import { defaultMemoryManager, MemoryStatus } from "./memory-manager.js";
import { defaultAuditLogger, AIEvents } from "./audit-logger.js";

export class LearningPipeline {
  constructor(options = {}) {
    this.memoryManager = options.memoryManager || defaultMemoryManager;
    this.logger = options.logger || defaultAuditLogger;
    this.confidenceThreshold = options.confidenceThreshold || 0.75;
  }

  async processConversation({ conversationId, customerId, assistantId, messages = [] }) {
    if (!messages || messages.length < 2) return [];

    const extractedInsights = [];

    for (const msg of messages) {
      if (msg.role !== "user" && msg.role !== "customer") continue;
      const text = msg.content || "";

      // 1. Preferencias de servicio
      const dateMatch = text.match(/(boda|quincea[ñn]era|evento|graduaci[oó]n|estudio|sesi[oó]n)/i);
      if (dateMatch) {
        const mem = this.memoryManager.createMemory({
          source: "conversation_learning",
          assistantId,
          conversationId,
          customerId,
          namespace: "crm_photography",
          category: "service_interest",
          content: `Interés expresado en servicio de ${dateMatch[0].toLowerCase()}`,
          confidence: 0.85,
          status: MemoryStatus.VALIDATED,
          metadata: { triggerText: text }
        });
        extractedInsights.push(mem);
      }

      // 2. Objeción de precio
      if (/caro|descuento|presupuesto|rebaja|muy alto|menos precio/i.test(text)) {
        const mem = this.memoryManager.createMemory({
          source: "conversation_learning",
          assistantId,
          conversationId,
          customerId,
          namespace: "crm_sales",
          category: "objection",
          content: "Cliente manifestó sensibilidad al precio o solicitó alternativas de presupuesto.",
          confidence: 0.90,
          status: MemoryStatus.VALIDATED,
          metadata: { triggerText: text }
        });
        extractedInsights.push(mem);
      }

      // 3. Consulta recurrente
      if (/qu[eé] incluye|cu[aá]nto tiempo|d[oó]nde est[aá]n|c[oó]mo se reserva|horario/i.test(text)) {
        const mem = this.memoryManager.createMemory({
          source: "conversation_learning",
          assistantId,
          conversationId,
          customerId,
          namespace: "global",
          category: "faq",
          content: `Consulta recurrente: «${text.trim()}»`,
          confidence: 0.70,
          status: MemoryStatus.CANDIDATE,
          metadata: { rawQuestion: text }
        });
        extractedInsights.push(mem);
      }
    }

    return extractedInsights;
  }
}

export const defaultLearningPipeline = new LearningPipeline();
