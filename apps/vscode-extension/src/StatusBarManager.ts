import * as vscode from 'vscode';
import type { ApiSession } from './DaemonClient.js';

export class StatusBarManager {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'observer.listSessions';
    this.showDisconnected();
    this.item.show();
  }

  showDisconnected(): void {
    this.item.text = '$(circle-slash) Observer';
    this.item.tooltip = 'Observer OS: daemon not reachable. Click to retry.';
    this.item.backgroundColor = undefined;
    this.item.color = new vscode.ThemeColor('statusBarItem.warningForeground');
  }

  showConnected(session: ApiSession | null): void {
    if (!session) {
      this.item.text = '$(pulse) Observer: no session';
      this.item.tooltip = 'Observer OS: connected. Click to start or select a session.';
      this.item.color = undefined;
      return;
    }
    const statusIcon = session.status === 'ACTIVE' ? '$(pulse)' : '$(circle-filled)';
    this.item.text = `${statusIcon} Observer: ${session.name ?? session.id.slice(0, 8)} (${session.nodeCount}n/${session.eventCount}e)`;
    this.item.tooltip = `Observer OS session: ${session.name ?? session.id}\nStatus: ${session.status}\nNodes: ${session.nodeCount} | Events: ${session.eventCount}\nClick to manage sessions`;
    this.item.color = undefined;
  }

  showError(message: string): void {
    this.item.text = `$(error) Observer: ${message}`;
    this.item.color = new vscode.ThemeColor('statusBarItem.errorForeground');
  }

  dispose(): void {
    this.item.dispose();
  }
}
