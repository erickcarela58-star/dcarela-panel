/**
 * AI Core - Admin Dashboard UI Component
 * Panel visual independiente para supervisar estado del cerebro, memorias y moderar candidatos.
 */

import { defaultMemoryManager, MemoryStatus } from "./memory-manager.js";
import { defaultAssistantRegistry } from "./assistant-registry.js";
import { defaultAuditLogger } from "./audit-logger.js";
import { defaultProviderRouter } from "./ai-provider-router.js";

export class AIAdminDashboard {
  constructor(containerElement) {
    this.container = containerElement;
    this.memoryManager = defaultMemoryManager;
    this.registry = defaultAssistantRegistry;
    this.logger = defaultAuditLogger;
    this.router = defaultProviderRouter;
  }

  render() {
    if (!this.container) return;

    const assistants = this.registry.list();
    const candidates = this.memoryManager.listCandidates();
    const activeMemories = this.memoryManager.listActive();
    const recentLogs = this.logger.getRecentLogs(10);
    const activeProvider = this.router.getProvider();

    this.container.innerHTML = `
      <div class="ai-dashboard-root">
        <div class="ai-dashboard-header">
          <div class="ai-status-pill online">
            <span class="dot"></span>
            <strong>CEREBRO AI CENTRAL: ONLINE</strong>
          </div>
          <div class="ai-header-meta">
            <span>Proveedor: <strong>${activeProvider.name}</strong></span>
            <span>Modelo: <strong>${activeProvider.defaultModel}</strong></span>
          </div>
        </div>

        <div class="ai-grid-stats">
          <div class="ai-stat-card">
            <div class="stat-label">Asistentes Conectados</div>
            <div class="stat-value">${assistants.length}</div>
          </div>
          <div class="ai-stat-card">
            <div class="stat-label">Memorias Activas</div>
            <div class="stat-value">${activeMemories.length}</div>
          </div>
          <div class="ai-stat-card highlight">
            <div class="stat-label">Candidatas por Moderar</div>
            <div class="stat-value">${candidates.length}</div>
          </div>
        </div>

        <div class="ai-section">
          <h3>Moderación de Aprendizaje (Memorias Candidatas)</h3>
          ${candidates.length === 0 ? '<p class="ai-empty">No hay memorias candidatas pendientes de moderación.</p>' : `
            <div class="ai-candidates-list">
              ${candidates.map(c => `
                <div class="ai-candidate-row" data-id="${c.id}">
                  <div class="candidate-info">
                    <span class="candidate-category">[${c.category.toUpperCase()}]</span>
                    <span class="candidate-text">${c.content}</span>
                    <span class="candidate-confidence">Confianza: ${(c.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div class="candidate-actions">
                    <button class="btn-ai-approve" onclick="window.__aiDashboard.approveCandidate('${c.id}')">Aprobar</button>
                    <button class="btn-ai-reject" onclick="window.__aiDashboard.rejectCandidate('${c.id}')">Rechazar</button>
                  </div>
                </div>
              `).join("")}
            </div>
          `}
        </div>

        <div class="ai-section">
          <h3>Registro de Eventos Recientes (Observabilidad)</h3>
          <div class="ai-logs-list">
            ${recentLogs.map(l => `
              <div class="ai-log-row">
                <span class="log-time">${new Date(l.timestamp).toLocaleTimeString()}</span>
                <span class="log-event">${l.eventType}</span>
                <span class="log-assistant">${l.assistantId}</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;

    if (typeof window !== "undefined") {
      window.__aiDashboard = this;
    }
  }

  approveCandidate(id) {
    this.memoryManager.updateStatus(id, MemoryStatus.ACTIVE);
    this.render();
  }

  rejectCandidate(id) {
    this.memoryManager.updateStatus(id, MemoryStatus.REJECTED);
    this.render();
  }
}
