/**
 * AI Core - Assistant Registry
 * Registro y definición de asistentes con namespaces, políticas de herramientas y perfiles de sistema.
 */

export class AssistantRegistry {
  constructor() {
    this.assistants = new Map();
    this._registerDefaultAssistants();
  }

  _registerDefaultAssistants() {
    this.register({
      id: "crm.sales",
      name: "Asistente de Ventas y Cotizaciones",
      module: "crm",
      purpose: "Asesorar a clientes sobre paquetes fotográficos, resolver dudas y guiar hacia la reserva.",
      systemProfile: "Eres el Asistente Experto en Ventas de D' Carela Estudio Fotográfico. Tu objetivo es asesorar cálidamente sobre paquetes de bodas, quinceañeras, sesiones de estudio y eventos, respondiendo dudas con claridad y proponiendo el siguiente paso para agendar o cotizar.",
      allowedTools: ["calculate_quote", "check_availability", "create_lead_followup"],
      memoryNamespace: "crm_sales",
      knowledgeSources: ["catalog_packages", "pricing_policy", "studio_locations"],
      responseStyle: "persuasive_natural",
      permissions: ["read:leads", "write:quotes"]
    });

    this.register({
      id: "crm.customer_support",
      name: "Atención al Cliente y Entregas",
      module: "crm",
      purpose: "Dar seguimiento a entregas de fotos, impresiones, cuadros y resolver dudas postventa.",
      systemProfile: "Eres el Asistente de Atención al Cliente de D' Carela Estudio Fotográfico. Responde con empatía, rapidez y precisión sobre el estado de edición de fotografías, fechas de entrega de álbumes y soporte postventa.",
      allowedTools: ["check_order_status", "schedule_delivery"],
      memoryNamespace: "crm_support",
      knowledgeSources: ["delivery_timelines", "print_specifications", "faq_support"],
      responseStyle: "helpful_empathic",
      permissions: ["read:orders", "write:support_tickets"]
    });

    this.register({
      id: "crm.photography",
      name: "Consultor Fotográfico y Creativo",
      module: "crm",
      purpose: "Asesorar en estilos visuales, vestuario, locaciones, iluminación y preparación previa a la sesión.",
      systemProfile: "Eres el Consultor Creativo de D' Carela. Guías a los clientes en vestuarios sugeridos, combinación de colores, conceptos para quinceañeras/bodas y mejores horarios de luz.",
      allowedTools: ["suggest_locations", "view_portfolio_samples"],
      memoryNamespace: "crm_creative",
      knowledgeSources: ["style_guides", "location_catalog"],
      responseStyle: "creative_inspiring",
      permissions: ["read:portfolio"]
    });

    this.register({
      id: "brujula.general",
      name: "Asistente General Brújula",
      module: "brujula",
      purpose: "Acompañamiento personal, reflexión, enfoque firme y productividad diaria.",
      systemProfile: "Eres el Asistente Central de Brújula. Ayudas al usuario a mantener el enfoque, reflexionar sobre el uso de su tiempo, superar distracciones y cumplir sus metas con disciplina consciente.",
      allowedTools: ["create_task", "start_focus_period", "log_reflection"],
      memoryNamespace: "brujula_personal",
      knowledgeSources: ["internalized_books", "habit_protocols"],
      responseStyle: "firm_reflective",
      permissions: ["read:tasks", "write:tasks", "manage:focus"]
    });

    this.register({
      id: "brujula.productivity",
      name: "Planificador de Tareas y Hábitos",
      module: "brujula",
      purpose: "Estructurar pendientes, bloques de tiempo y prioridades del día.",
      systemProfile: "Eres el Planificador de Brújula. Ayudas a descomponer proyectos en tareas de acción inmediata, priorizar el día y organizar bloques de enfoque.",
      allowedTools: ["create_task", "list_daily_plan"],
      memoryNamespace: "brujula_tasks",
      knowledgeSources: ["daily_schedule", "task_priorities"],
      responseStyle: "concise_actionable",
      permissions: ["read:tasks", "write:tasks"]
    });

    this.register({
      id: "brujula.reading",
      name: "Tutor de Lecturas y RAG",
      module: "brujula",
      purpose: "Consultar conocimiento interiorizado de libros, PDFs y artículos procesados.",
      systemProfile: "Eres el Tutor de Lecturas de Brújula. Respondes preguntas extrayendo sabiduría directamente de los libros y notas que el usuario ha interiorizado.",
      allowedTools: ["query_book_knowledge", "summarize_document"],
      memoryNamespace: "brujula_reading",
      knowledgeSources: ["internalized_books", "reading_library"],
      responseStyle: "insightful_deep",
      permissions: ["read:library"]
    });
  }

  register(assistantConfig) {
    if (!assistantConfig || !assistantConfig.id) {
      throw new Error("El asistente requiere un 'id' único.");
    }
    this.assistants.set(assistantConfig.id, {
      ...assistantConfig,
      registeredAt: new Date().toISOString()
    });
  }

  get(assistantId) {
    return this.assistants.get(assistantId) || null;
  }

  list() {
    return Array.from(this.assistants.values());
  }

  listByModule(module) {
    return this.list().filter(a => a.module === module);
  }
}

export const defaultAssistantRegistry = new AssistantRegistry();
