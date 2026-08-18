/**
 * AI Core - Learning Pipeline
 * Extracción controlada de hechos, consolidación de conocimiento y detección de patrones de alta confianza.
 * Aprende automáticamente reglas de negocio, hábitos de pago a proveedores, alias y correcciones operativas.
 */

import { defaultMemoryManager, MemoryStatus } from "./memory-manager.js";
import { defaultAuditLogger, AIEvents } from "./audit-logger.js";

export class LearningPipeline {
  constructor(options = {}) {
    this.memoryManager = options.memoryManager || defaultMemoryManager;
    this.logger = options.logger || defaultAuditLogger;
    this.confidenceThreshold = options.confidenceThreshold || 0.75;
  }

  /**
   * Extrae aprendizajes operativos directamente de un mensaje o instrucción del operador.
   * Devuelve un array de objetos de aprendizaje extraídos y guardados en memoria.
   */
  extractOperationalLearnings(text, { businessId = "dcarela", userId = "admin", conversationId = null } = {}) {
    if (!text || typeof text !== "string" || text.trim().length < 5) return [];

    const t = text.trim();
    const learnings = [];

    // 1. Detección de método de pago preferido para proveedor o gasto
    // Ej: "Comercial Rosa se paga con tarjeta", "compras en comercial rosa hechas con tarjeta de credito"
    const supplierPaymentMatch = t.match(/(?:compras?\s+en|pago\s+a|gastos?\s+en|proveedor)\s+([A-Za-z0-9\sÁÉÍÓÚáéíóúñÑ]+?)\s+(?:se\s+paga|hech[ao]s?|pagad[ao]s?)\s+con\s+(?:la\s+)?(tarjeta|efectivo|transferencia|popular|banco|qik)/i) ||
      t.match(/([A-Za-z0-9\sÁÉÍÓÚáéíóúñÑ]{3,30})\s+(?:siempre\s+)?se\s+paga\s+con\s+(?:la\s+)?(tarjeta|efectivo|transferencia|popular|banco|qik)/i);

    if (supplierPaymentMatch) {
      const entity = supplierPaymentMatch[1].trim();
      const method = supplierPaymentMatch[2].toLowerCase().trim();
      if (entity.length > 2 && !/^(este|esta|estos|estas|un|una|el|la|los|las)$/i.test(entity)) {
        const mem = this.memoryManager.createMemory({
          source: "operational_instruction",
          assistantId: "pos_assistant",
          conversationId,
          namespace: "finance_rules",
          category: "supplier_payment_default",
          content: `Regla de pago: '${entity}' se paga habitualmente con ${method}.`,
          summary: `${entity} ➔ ${method}`,
          confidence: 0.95,
          status: MemoryStatus.ACTIVE,
          metadata: { entity, method, rawText: t }
        });
        learnings.push(mem);
      }
    }

    // 2. Detección de costos recurrentes y compromisos mensuales
    // Ej: "ChatGPT se cobro 28 dolares en suscripcion y cuota mensual en popular"
    const recurringMatch = t.match(/([A-Za-z0-9\sÁÉÍÓÚáéíóúñÑ]{3,30})\s+(?:es\s+un\s+)?(?:suscripci[oó]n|cuota\s+mensual|costo\s+recurrente|compromiso)/i);
    if (recurringMatch) {
      const name = recurringMatch[1].trim();
      if (name.length > 2 && !/^(este|esta|estos|estas)$/i.test(name)) {
        const mem = this.memoryManager.createMemory({
          source: "recurring_learning",
          assistantId: "pos_assistant",
          conversationId,
          namespace: "finance_commitments",
          category: "recurring_service",
          content: `Servicio recurrente identificado: '${name}' es una suscripción o costo periódico.`,
          summary: `Recurrente: ${name}`,
          confidence: 0.90,
          status: MemoryStatus.ACTIVE,
          metadata: { serviceName: name, rawText: t }
        });
        learnings.push(mem);
      }
    }

    // 3. Detección de correcciones del usuario (Feedback loop)
    // Ej: "No, eso no fue en efectivo, fue por transferencia", "La papeleria no es impresion, es materiales"
    const correctionMatch = t.match(/(?:no,\s+eso\s+no\s+fue\s+|correcci[oó]n:\s*|en\s+realidad\s+fue\s+|eso\s+va\s+en\s+)(.+)/i);
    if (correctionMatch) {
      const correction = correctionMatch[1].trim();
      if (correction.length > 5) {
        const mem = this.memoryManager.createMemory({
          source: "user_correction",
          assistantId: "pos_assistant",
          conversationId,
          namespace: "operator_corrections",
          category: "behavior_correction",
          content: `Corrección del operador: ${correction}`,
          summary: `Corrección: ${correction.slice(0, 40)}`,
          confidence: 0.98,
          status: MemoryStatus.ACTIVE,
          metadata: { correctionText: correction, rawText: t }
        });
        learnings.push(mem);
      }
    }

    // 4. Mapeo de categorías o conceptos
    // Ej: "papelería pertenece a la categoría materiales"
    const categoryMappingMatch = t.match(/([A-Za-z0-9\sÁÉÍÓÚáéíóúñÑ]{3,25})\s+(?:es|pertenece\s+a\s+la?\s+categor[ií]a|se\s+clasifica\s+como)\s+([A-Za-z0-9\sÁÉÍÓÚáéíóúñÑ]{3,25})/i);
    if (categoryMappingMatch) {
      const item = categoryMappingMatch[1].trim();
      const category = categoryMappingMatch[2].trim();
      if (item.length > 2 && category.length > 2) {
        const mem = this.memoryManager.createMemory({
          source: "category_mapping",
          assistantId: "pos_assistant",
          conversationId,
          namespace: "catalog_rules",
          category: "item_category_mapping",
          content: `Clasificación: '${item}' pertenece a la categoría '${category}'.`,
          summary: `${item} ➔ ${category}`,
          confidence: 0.92,
          status: MemoryStatus.ACTIVE,
          metadata: { item, category, rawText: t }
        });
        learnings.push(mem);
      }
    }

    return learnings;
  }

  async processConversation({ conversationId, customerId, assistantId, messages = [] }) {
    if (!messages || messages.length < 2) return [];

    const extractedInsights = [];

    for (const msg of messages) {
      if (msg.role !== "user" && msg.role !== "customer") continue;
      const text = msg.content || "";

      // Extracción operativa básica
      const operational = this.extractOperationalLearnings(text, { conversationId });
      if (operational.length) {
        extractedInsights.push(...operational);
      }

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
