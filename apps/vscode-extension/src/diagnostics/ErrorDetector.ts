import * as vscode from 'vscode';
import type { DaemonClient } from '../DaemonClient.js';

export class ErrorDetector {
  private notifiedNodeIds = new Set<string>();
  private disposed = false;

  constructor(
    private readonly client: DaemonClient,
    private readonly getSessionId: () => string | null,
    private readonly isEnabled: () => boolean,
  ) {}

  async checkOnce(): Promise<void> {
    if (this.disposed || !this.isEnabled()) return;
    const sessionId = this.getSessionId();
    if (!sessionId) return;

    let nodes;
    try {
      nodes = await this.client.getNodes(sessionId);
    } catch { return; }

    for (const node of nodes) {
      if (node.status === 'FAILED' && !this.notifiedNodeIds.has(node.id)) {
        this.notifiedNodeIds.add(node.id);
        const action = await vscode.window.showErrorMessage(
          `Observer: ${node.type} FAILED (${node.domain})`,
          'Copy Context',
        );
        if (action === 'Copy Context') {
          await vscode.commands.executeCommand('observer.copyContext');
        }
      }
    }
  }

  resetSession(): void {
    this.notifiedNodeIds.clear();
  }

  dispose(): void {
    this.disposed = true;
  }
}
