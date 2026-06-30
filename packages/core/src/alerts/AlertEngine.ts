import { randomUUID } from 'node:crypto';
import type { RuntimeEvent } from '../types/event.js';
import type { RuntimeNode } from '../types/node.js';
import type { NodeId, SessionId } from '../types/ids.js';
import type { AlertRule, AlertFire } from './types.js';

const MAX_FIRES = 500;

export class AlertEngine {
  private rules = new Map<string, AlertRule>();
  private fires: AlertFire[] = [];

  // ── Rule management ────────────────────────────────────────────────────────

  addRule(rule: Omit<AlertRule, 'id' | 'createdAt'>): AlertRule {
    const full: AlertRule = { ...rule, id: randomUUID(), createdAt: Date.now() };
    this.rules.set(full.id, full);
    return full;
  }

  removeRule(id: string): boolean {
    return this.rules.delete(id);
  }

  updateRule(id: string, patch: Partial<Pick<AlertRule, 'name' | 'enabled' | 'action' | 'condition'>>): AlertRule | null {
    const rule = this.rules.get(id);
    if (!rule) return null;
    const updated = { ...rule, ...patch };
    this.rules.set(id, updated);
    return updated;
  }

  listRules(): AlertRule[] {
    return [...this.rules.values()];
  }

  listFires(limit = 50): AlertFire[] {
    return this.fires.slice(-limit).reverse();
  }

  clearFires(): void {
    this.fires = [];
  }

  // ── Evaluation ─────────────────────────────────────────────────────────────

  /** Called by projection engine after every node upsert. */
  evaluateNode(node: RuntimeNode, sessionId: SessionId): void {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      const cond = rule.condition;

      if (cond.type === 'node.status' && node.status === cond.status) {
        this.fire(rule, sessionId, node.id, null, {
          nodeType: node.type,
          domain: node.domain,
          status: node.status,
        });
      }
    }
  }

  /** Called by event log after every append. */
  evaluateEvent(event: RuntimeEvent): void {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      const cond = rule.condition;

      if (cond.type === 'event.severity') {
        const sevOrder: Record<string, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 };
        const threshold = sevOrder[cond.severity] ?? 3;
        const eventSev = sevOrder[event.severity] ?? 1;
        if (eventSev >= threshold) {
          this.fire(rule, event.sessionId, null, event.type, {
            severity: event.severity,
            eventType: event.type,
            nodeId: event.sourceNodeId,
          });
        }
      }

      if (cond.type === 'query.duration') {
        const duration = (event.payload as Record<string, unknown>)?.duration;
        if (typeof duration === 'number' && duration >= cond.thresholdMs) {
          this.fire(rule, event.sessionId, null, event.type, {
            duration,
            query: (event.payload as Record<string, unknown>)?.query ?? null,
            nodeId: event.sourceNodeId,
          });
        }
      }
    }
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private fire(
    rule: AlertRule,
    sessionId: SessionId,
    nodeId: NodeId | null,
    eventType: string | null,
    detail: Record<string, unknown>,
  ): void {
    const fire: AlertFire = {
      ruleId: rule.id,
      ruleName: rule.name,
      sessionId,
      nodeId,
      eventType,
      detail,
      firedAt: Date.now(),
    };

    this.fires.push(fire);
    if (this.fires.length > MAX_FIRES) this.fires.shift();

    this.executeAction(rule, fire);
  }

  private executeAction(rule: AlertRule, fire: AlertFire): void {
    const { action } = rule;

    if (action.type === 'log') {
      console.log(`[observer:alert] ${rule.name}`, JSON.stringify(fire.detail));
      return;
    }

    if (action.type === 'webhook') {
      this.sendWebhook(action.url, fire, action.secret).catch((err) => {
        console.error(`[observer:alert] webhook failed for rule "${rule.name}":`, err);
      });
    }
  }

  private async sendWebhook(url: string, fire: AlertFire, secret?: string): Promise<void> {
    const body = JSON.stringify(fire);
    const headers: Record<string, string> = { 'content-type': 'application/json' };

    if (secret) {
      const { createHmac } = await import('node:crypto');
      const sig = createHmac('sha256', secret).update(body).digest('hex');
      headers['x-observer-signature'] = `sha256=${sig}`;
    }

    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
  }
}
