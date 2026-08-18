/**
 * AI Core - Conversation Analyzer
 * Análisis asíncrono de intenciones, etapas del prospecto y señales comerciales.
 */

import { defaultAuditLogger, AIEvents } from "./audit-logger.js";

export const CustomerIntents = {
  INFO: "informacion",
  QUOTE: "cotizacion",
  BOOKING: "reserva",
  PURCHASE: "compra",
  CLAIM: "reclamacion",
  FOLLOWUP: "seguimiento",
  INDECISION: "indecision",
  ABANDON: "abandono"
};

export const LeadStages = {
  NEW: "lead_nuevo",
  INTERESTED: "interesado",
  QUOTED: "cotizado",
  NEGOTIATING: "negociando",
  AWAITING_REPLY: "esperando_respuesta",
  BOOKED: "reservado",
  WON: "vendido",
  LOST: "perdido"
};

export class ConversationAnalyzer {
  constructor(options = {}) {
    this.logger = options.logger || defaultAuditLogger;
  }

  analyze(messages = [], metadata = {}) {
    const fullText = messages.map(m => m.content || "").join(" ").toLowerCase();
    
    let primaryIntent = CustomerIntents.INFO;
    if (/reservar|apartar|fecha disponible|agenda/i.test(fullText)) {
      primaryIntent = CustomerIntents.BOOKING;
    } else if (/cu[aá]nto cuesta|precio|paquete|cotizaci[oó]n|costo/i.test(fullText)) {
      primaryIntent = CustomerIntents.QUOTE;
    } else if (/queja|retraso|inconforme|no me gust[oó]|da[ñn]ado/i.test(fullText)) {
      primaryIntent = CustomerIntents.CLAIM;
    }

    let stage = LeadStages.NEW;
    if (primaryIntent === CustomerIntents.BOOKING) {
      stage = LeadStages.NEGOTIATING;
    } else if (primaryIntent === CustomerIntents.QUOTE) {
      stage = LeadStages.INTERESTED;
    }

    const signals = [];
    if (/urgente|ma[ñn]ana|esta semana|pronto/i.test(fullText)) {
      signals.push("alta_urgencia");
    }
    if (/caro|descuento|presupuesto/i.test(fullText)) {
      signals.push("objecion_precio");
    }
    if (/fotos adicionales|video|cuadro|album|dron/i.test(fullText)) {
      signals.push("oportunidad_upsell");
    }

    const analysis = {
      conversationId: metadata.conversationId || null,
      customerId: metadata.customerId || null,
      intent: primaryIntent,
      stage,
      signals,
      analyzedAt: new Date().toISOString()
    };

    this.logger.log(AIEvents.CONVERSATION_ANALYZED, {
      assistantId: metadata.assistantId || "crm.sales",
      conversationId: metadata.conversationId || null,
      customerId: metadata.customerId || null,
      metadata: analysis
    });

    return analysis;
  }
}

export const defaultConversationAnalyzer = new ConversationAnalyzer();
