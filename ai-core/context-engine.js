/**
 * AI Core - Context Engine
 * Construcción modular y selectiva del contexto del asistente:
 * BASE SYSTEM PROMPT + STYLE MODIFIER + CONTEXT + MEMORY + RAG
 */

import { defaultAssistantRegistry } from "./assistant-registry.js";
import { defaultMemoryManager } from "./memory-manager.js";
import { defaultAuditLogger, AIEvents } from "./audit-logger.js";

export const StyleModifiers = {
  base: "",
  coqueto: `
[MODIFICADOR DE ESTILO: COQUETO]
- Adopta un tono conversacional ligero, seguro, juguetón y atractivo.
- Agrega un toque de insinuación elegante y simpática solo cuando sea natural.
- Conserva la profesionalidad, el respeto y no fuerces frases prefabricadas.`,
  retador: `
[MODIFICADOR DE ESTILO: RETADOR]
- Adopta un tono con desafío constructivo, firmeza, picardía y tensión conversacional estimulante.
- Cuestiona de forma inteligente para motivar al interlocutor a dar su máximo o tomar acción decidida.
- Evita la hostilidad o agresividad innecesaria.`,
  seductor: `
[MODIFICADOR DE ESTILO: SEDUCTOR]
- Adopta un tono magnético, pausado, persuasivo, seguro y sugerente.
- Utiliza un vocabulario cautivador y elegante que genere interés genuino y conexión profunda.
- Mantén la sutileza y la naturalidad.`
};

export class ContextEngine {
  constructor(options = {}) {
    this.assistantRegistry = options.assistantRegistry || defaultAssistantRegistry;
    this.memoryManager = options.memoryManager || defaultMemoryManager;
    this.logger = options.logger || defaultAuditLogger;
  }

  buildContext({
    assistantId = "crm.sales",
    conversationId = null,
    customerId = null,
    responseStyle = "base",
    businessContext = {},
    customInstructions = ""
  }) {
    const assistant = this.assistantRegistry.get(assistantId);
    const baseSystemProfile = assistant ? assistant.systemProfile : "Eres un asistente de IA útil y profesional.";
    const styleModifier = StyleModifiers[responseStyle] || StyleModifiers.base;

    const memories = this.memoryManager.getMemoriesForContext({
      customerId,
      namespace: assistant ? assistant.memoryNamespace : null,
      limit: 6
    });

    let memoryBlock = "";
    if (memories.length > 0) {
      memoryBlock = "\n\n[MEMORIA RELEVANTE Y CONTEXTO APRENDIDO]:\n" +
        memories.map(m => `- [${m.category.toUpperCase()}] ${m.content}`).join("\n");
    }

    let businessBlock = "";
    if (Object.keys(businessContext).length > 0) {
      businessBlock = "\n\n[DATOS DEL NEGOCIO / SESIÓN]:\n" +
        JSON.stringify(businessContext, null, 2);
    }

    const fullSystemPrompt = [
      baseSystemProfile,
      styleModifier,
      memoryBlock,
      businessBlock,
      customInstructions ? `\n\n[INSTRUCCIONES ADICIONALES]:\n${customInstructions}` : ""
    ].filter(Boolean).join("");

    this.logger.log(AIEvents.ASSISTANT_CONTEXT_BUILT, {
      assistantId,
      conversationId,
      customerId,
      metadata: { responseStyle, memoriesCount: memories.length }
    });

    return {
      assistant,
      responseStyle,
      systemPrompt: fullSystemPrompt,
      retrievedMemories: memories
    };
  }
}

export const defaultContextEngine = new ContextEngine();
