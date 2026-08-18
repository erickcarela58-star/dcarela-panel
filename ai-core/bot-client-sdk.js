/**
 * AI Core - BotClient SDK
 * SDK unificado para integrar el cerebro del bot en CRM Web, Brújula y módulos externos.
 */

import { defaultContextEngine } from "./context-engine.js";
import { defaultProviderRouter } from "./ai-provider-router.js";
import { defaultConversationAnalyzer } from "./conversation-analyzer.js";
import { defaultLearningPipeline } from "./learning-pipeline.js";
import { defaultAuditLogger, AIEvents } from "./audit-logger.js";

export class BotClient {
  constructor(config = {}) {
    this.assistantId = config.assistantId || "crm.sales";
    this.conversationId = config.conversationId || "conv_" + Math.random().toString(36).substring(2, 9);
    this.customerId = config.customerId || null;
    this.responseStyle = config.responseStyle || "base";
    
    this.contextEngine = config.contextEngine || defaultContextEngine;
    this.providerRouter = config.providerRouter || defaultProviderRouter;
    this.analyzer = config.analyzer || defaultConversationAnalyzer;
    this.learningPipeline = config.learningPipeline || defaultLearningPipeline;
    this.logger = config.logger || defaultAuditLogger;
  }

  setStyle(newStyle) {
    if (!["base", "coqueto", "retador", "seductor"].includes(newStyle)) {
      newStyle = "base";
    }
    this.responseStyle = newStyle;
    this.logger.log(AIEvents.STYLE_CHANGED, {
      assistantId: this.assistantId,
      conversationId: this.conversationId,
      metadata: { newStyle }
    });
  }

  async sendMessage(messageText, history = []) {
    const messages = [...history, { role: "user", content: messageText }];
    
    const runtimeContext = this.contextEngine.buildContext({
      assistantId: this.assistantId,
      conversationId: this.conversationId,
      customerId: this.customerId,
      responseStyle: this.responseStyle
    });

    const result = await this.providerRouter.executePrompt({
      systemPrompt: runtimeContext.systemPrompt,
      messages,
      responseStyle: this.responseStyle,
      metadata: {
        assistantId: this.assistantId,
        conversationId: this.conversationId,
        customerId: this.customerId
      }
    });

    setTimeout(async () => {
      try {
        const fullMessages = [...messages, { role: "assistant", content: result.text }];
        this.analyzer.analyze(fullMessages, {
          assistantId: this.assistantId,
          conversationId: this.conversationId,
          customerId: this.customerId
        });

        await this.learningPipeline.processConversation({
          assistantId: this.assistantId,
          conversationId: this.conversationId,
          customerId: this.customerId,
          messages: fullMessages
        });
      } catch (err) {
        console.error("[BotClient Background Learning Error]", err);
      }
    }, 10);

    return {
      text: result.text,
      assistantId: this.assistantId,
      responseStyle: this.responseStyle,
      durationMs: result.durationMs
    };
  }

  submitFeedback(messageId, rating, feedbackText = "") {
    this.logger.log(AIEvents.FEEDBACK_RECEIVED, {
      assistantId: this.assistantId,
      conversationId: this.conversationId,
      metadata: { messageId, rating, feedbackText }
    });
    return { success: true };
  }
}
