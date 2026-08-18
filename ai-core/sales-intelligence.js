/**
 * AI Core - Sales Intelligence
 * Generación de recomendaciones internas proactivas para operadores del CRM.
 */

export class SalesIntelligence {
  generateSuggestions({ customer, conversation, lastAnalysis }) {
    const suggestions = [];

    if (lastAnalysis) {
      if (lastAnalysis.signals.includes("objecion_precio")) {
        suggestions.push({
          type: "OFFER_FLEXIBLE_PLAN",
          title: "Ofrecer plan de pago o paquete modular",
          reason: "El cliente expresó sensibilidad de precio.",
          actionText: "Enviar propuesta con paquete Esencial y opción de reserva con 30%."
        });
      }

      if (lastAnalysis.signals.includes("oportunidad_upsell")) {
        suggestions.push({
          type: "UPSELL_ALBUM_OR_DRONE",
          title: "Oportunidad de Venta Adicional",
          reason: "El cliente preguntó por productos complementarios (álbum/dron).",
          actionText: "Mostrar muestra visual del cuadro Canvas o video cinemático."
        });
      }

      if (lastAnalysis.signals.includes("alta_urgencia")) {
        suggestions.push({
          type: "PRIORITY_FOLLOWUP",
          title: "Atención Inmediata Requerida",
          reason: "Fecha de evento muy cercana.",
          actionText: "Llamar o enviar disponibilidad inmediata de agenda."
        });
      }
    }

    return suggestions;
  }
}

export const defaultSalesIntelligence = new SalesIntelligence();
