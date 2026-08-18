/**
 * AI Core - Multi-Provider Router
 * Capa de abstracción para enrutar peticiones a Gemini, OpenAI, Claude, OpenRouter o endpoints compatibles.
 */

import { defaultAuditLogger, AIEvents } from "./audit-logger.js";

export class AIProviderRouter {
  constructor(config = {}) {
    this.providers = new Map();
    this.activeProviderId = config.defaultProvider || "gemini";
    this.logger = config.logger || defaultAuditLogger;
    this._registerBuiltinProviders(config);
  }

  _registerBuiltinProviders(config) {
    this.registerProvider("gemini", {
      name: "Google Gemini Pro / Flash",
      baseURL: "https://generativelanguage.googleapis.com/v1beta",
      apiKey: config.geminiApiKey || (typeof process !== "undefined" && process.env ? process.env.GEMINI_API_KEY : "") || "",
      defaultModel: "gemini-2.5-flash",
      temperature: 0.7,
      maxTokens: 2048,
      supportsStreaming: true
    });

    this.registerProvider("openai", {
      name: "OpenAI / GPT-4o",
      baseURL: "https://api.openai.com/v1",
      apiKey: config.openaiApiKey || (typeof process !== "undefined" && process.env ? process.env.OPENAI_API_KEY : "") || "",
      defaultModel: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: 2048,
      supportsStreaming: true
    });

    this.registerProvider("anthropic", {
      name: "Anthropic Claude 3.5",
      baseURL: "https://api.anthropic.com/v1",
      apiKey: config.anthropicApiKey || (typeof process !== "undefined" && process.env ? process.env.ANTHROPIC_API_KEY : "") || "",
      defaultModel: "claude-3-5-sonnet-20241022",
      temperature: 0.7,
      maxTokens: 2048,
      supportsStreaming: true
    });

    this.registerProvider("supabase_edge", {
      name: "Supabase Edge Brain Function",
      baseURL: config.supabaseUrl ? `${config.supabaseUrl}/functions/v1` : "",
      apiKey: config.supabaseAnonKey || "",
      defaultModel: "operations-brain",
      temperature: 0.7,
      maxTokens: 2048,
      supportsStreaming: true
    });
  }

  registerProvider(id, options) {
    this.providers.set(id, {
      id,
      name: options.name || id,
      baseURL: options.baseURL || "",
      apiKey: options.apiKey || "",
      defaultModel: options.defaultModel || "default-model",
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens || 2048,
      timeoutMs: options.timeoutMs || 30000,
      customHeaders: options.customHeaders || {},
      supportsStreaming: Boolean(options.supportsStreaming),
      status: options.apiKey || id === "supabase_edge" ? "ACTIVE" : "UNCONFIGURED"
    });
  }

  getProvider(id = null) {
    const targetId = id || this.activeProviderId;
    return this.providers.get(targetId) || this.providers.get(this.activeProviderId);
  }

  setActiveProvider(id) {
    if (!this.providers.has(id)) {
      throw new Error(`Proveedor '${id}' no está registrado.`);
    }
    this.activeProviderId = id;
  }

  async executePrompt({ systemPrompt, messages, providerId = null, model = null, temperature = null, responseStyle = "base", metadata = {} }) {
    const startTime = Date.now();
    const provider = this.getProvider(providerId);

    this.logger.log(AIEvents.REQUEST_STARTED, {
      assistantId: metadata.assistantId || "core",
      conversationId: metadata.conversationId || null,
      metadata: { providerId: provider.id, model: model || provider.defaultModel, responseStyle }
    });

    try {
      let responseText = "";

      if (provider.apiKey && provider.baseURL && typeof fetch !== "undefined") {
        responseText = await this._sendHttpRequest(provider, { systemPrompt, messages, model, temperature });
      } else {
        responseText = this._generateLocalResponse({ systemPrompt, messages, responseStyle });
      }

      const durationMs = Date.now() - startTime;
      this.logger.log(AIEvents.REQUEST_COMPLETED, {
        assistantId: metadata.assistantId || "core",
        conversationId: metadata.conversationId || null,
        durationMs,
        metadata: { responseLength: responseText.length }
      });

      return {
        text: responseText,
        provider: provider.id,
        model: model || provider.defaultModel,
        durationMs
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      this.logger.log(AIEvents.REQUEST_FAILED, {
        assistantId: metadata.assistantId || "core",
        conversationId: metadata.conversationId || null,
        durationMs,
        errorCode: err.message,
        metadata: { error: err.stack }
      });
      throw err;
    }
  }

  _generateLocalResponse({ systemPrompt, messages, responseStyle }) {
    const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1].content : "";
    let prefix = "";
    if (responseStyle === "coqueto") {
      prefix = "✨ [Coqueto] ";
    } else if (responseStyle === "retador") {
      prefix = "⚡ [Retador] ";
    } else if (responseStyle === "seductor") {
      prefix = "🌙 [Seductor] ";
    }

    return `${prefix}Entendido. He procesado tu solicitud: «${lastMsg}» teniendo en cuenta el contexto del estudio y las políticas comerciales.`;
  }

  async _sendHttpRequest(provider, { systemPrompt, messages, model, temperature }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);
    try {
      const payload = {
        model: model || provider.defaultModel,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        temperature: temperature ?? provider.temperature
      };

      const res = await fetch(`${provider.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${provider.apiKey}`,
          ...provider.customHeaders
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`Provider HTTP Error: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || "";
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const defaultProviderRouter = new AIProviderRouter();
