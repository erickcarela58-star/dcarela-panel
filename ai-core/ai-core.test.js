import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AuditLogger,
  AIEvents,
  AssistantRegistry,
  AIProviderRouter,
  MemoryManager,
  MemoryStatus,
  LearningPipeline,
  ConversationAnalyzer,
  CustomerIntents,
  LeadStages,
  SalesIntelligence,
  ContextEngine,
  BotClient
} from './index.js';

test('1. AuditLogger sanitiza secretos y registra eventos estructurados', () => {
  const logger = new AuditLogger();
  const evt = logger.log(AIEvents.REQUEST_STARTED, {
    assistantId: 'crm.sales',
    metadata: {
      apiKey: 'sk-secret-12345',
      userPrompt: 'Hola mundo'
    }
  });

  assert.equal(evt.eventType, AIEvents.REQUEST_STARTED);
  assert.equal(evt.assistantId, 'crm.sales');
  assert.equal(evt.metadata.apiKey, '[REDACTED_SECRET]');
  assert.equal(evt.metadata.userPrompt, 'Hola mundo');
});

test('2. AssistantRegistry registra y recupera asistentes con namespaces correctos', () => {
  const registry = new AssistantRegistry();
  const sales = registry.get('crm.sales');
  assert.ok(sales);
  assert.equal(sales.module, 'crm');
  assert.equal(sales.memoryNamespace, 'crm_sales');

  const brujula = registry.get('brujula.general');
  assert.ok(brujula);
  assert.equal(brujula.module, 'brujula');
  assert.equal(brujula.memoryNamespace, 'brujula_personal');
});

test('3. MemoryManager aísla namespaces, deduplica y gestiona ciclo de vida', () => {
  const manager = new MemoryManager();
  
  // Crear memoria candidata
  const mem1 = manager.createMemory({
    customerId: 'cust_001',
    namespace: 'crm_sales',
    content: 'Cliente prefiere sesión de fotos al atardecer en playa.',
    category: 'preference',
    confidence: 0.9
  });
  assert.equal(mem1.status, MemoryStatus.CANDIDATE);
  assert.equal(mem1.usageCount, 1);

  // Deduplicación en la segunda llamada idéntica
  const mem2 = manager.createMemory({
    customerId: 'cust_001',
    namespace: 'crm_sales',
    content: 'Cliente prefiere sesión de fotos al atardecer en playa.',
    category: 'preference',
    confidence: 0.95
  });
  assert.equal(mem2.id, mem1.id);
  assert.equal(mem2.usageCount, 2);
  assert.equal(mem2.confidence, 0.95);

  // Validar y activar
  manager.updateStatus(mem1.id, MemoryStatus.ACTIVE);
  const activeList = manager.listActive();
  assert.equal(activeList.length, 1);

  // Aislamiento: otro cliente no debe ver esta memoria
  const otherContext = manager.getMemoriesForContext({ customerId: 'cust_999', namespace: 'crm_sales' });
  assert.equal(otherContext.length, 0);

  // El mismo cliente sí la recupera
  const sameContext = manager.getMemoriesForContext({ customerId: 'cust_001', namespace: 'crm_sales' });
  assert.equal(sameContext.length, 1);
});

test('4. LearningPipeline extrae hechos comerciales y objeciones de conversaciones', async () => {
  const memoryManager = new MemoryManager();
  const pipeline = new LearningPipeline({ memoryManager });

  const messages = [
    { role: 'user', content: 'Hola, quisiera cotizar una boda para diciembre, pero me parece un poco caro el paquete premium.' },
    { role: 'assistant', content: 'Con gusto te asesoramos con nuestras opciones.' }
  ];

  const extracted = await pipeline.processConversation({
    assistantId: 'crm.sales',
    conversationId: 'conv_123',
    customerId: 'cust_002',
    messages
  });

  assert.ok(extracted.length >= 2);
  const categories = extracted.map(e => e.category);
  assert.ok(categories.includes('service_interest'));
  assert.ok(categories.includes('objection'));
});

test('5. ConversationAnalyzer clasifica intenciones y señales comerciales', () => {
  const analyzer = new ConversationAnalyzer();
  const messages = [
    { role: 'user', content: '¿Cuánto cuesta el paquete de quinceañera? Es urgente para este sábado y quisiera saber si incluye cuadro y álbum adicional.' }
  ];

  const analysis = analyzer.analyze(messages, { conversationId: 'conv_456' });
  assert.equal(analysis.intent, CustomerIntents.QUOTE);
  assert.ok(analysis.signals.includes('alta_urgencia'));
  assert.ok(analysis.signals.includes('oportunidad_upsell'));
});

test('6. SalesIntelligence genera recomendaciones accionables para el operador', () => {
  const intel = new SalesIntelligence();
  const lastAnalysis = {
    signals: ['objecion_precio', 'oportunidad_upsell', 'alta_urgencia']
  };

  const suggestions = intel.generateSuggestions({ lastAnalysis });
  assert.equal(suggestions.length, 3);
  const types = suggestions.map(s => s.type);
  assert.ok(types.includes('OFFER_FLEXIBLE_PLAN'));
  assert.ok(types.includes('UPSELL_ALBUM_OR_DRONE'));
  assert.ok(types.includes('PRIORITY_FOLLOWUP'));
});

test('7. ContextEngine construye prompts modulares con modificadores de estilo (Coqueto, Retador, Seductor)', () => {
  const engine = new ContextEngine();
  
  const ctxBase = engine.buildContext({ assistantId: 'brujula.general', responseStyle: 'base' });
  assert.ok(!ctxBase.systemPrompt.includes('[MODIFICADOR DE ESTILO: COQUETO]'));

  const ctxCoqueto = engine.buildContext({ assistantId: 'brujula.general', responseStyle: 'coqueto' });
  assert.ok(ctxCoqueto.systemPrompt.includes('[MODIFICADOR DE ESTILO: COQUETO]'));

  const ctxRetador = engine.buildContext({ assistantId: 'brujula.general', responseStyle: 'retador' });
  assert.ok(ctxRetador.systemPrompt.includes('[MODIFICADOR DE ESTILO: RETADOR]'));

  const ctxSeductor = engine.buildContext({ assistantId: 'brujula.general', responseStyle: 'seductor' });
  assert.ok(ctxSeductor.systemPrompt.includes('[MODIFICADOR DE ESTILO: SEDUCTOR]'));
});

test('8. BotClient SDK gestiona estilo, envía mensajes y ejecuta aprendizaje en background', async () => {
  const client = new BotClient({
    assistantId: 'crm.sales',
    customerId: 'cust_003'
  });

  client.setStyle('coqueto');
  assert.equal(client.responseStyle, 'coqueto');

  const response = await client.sendMessage('Hola, me interesa una sesión de fotos de graduación.');
  assert.ok(response.text.length > 0);
  assert.equal(response.responseStyle, 'coqueto');

  const fb = client.submitFeedback('msg_001', 'positive', 'Excelente respuesta');
  assert.equal(fb.success, true);
});
