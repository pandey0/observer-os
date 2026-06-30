import * as vscode from 'vscode';
import { DaemonClient } from './DaemonClient.js';
import { StatusBarManager } from './StatusBarManager.js';
import { listSessionsCommand, startSessionCommand } from './commands/manageSessions.js';
import { copyContextCommand } from './commands/copyContext.js';
import { openExplorerCommand } from './commands/openExplorer.js';
import { ErrorDetector } from './diagnostics/ErrorDetector.js';

let pollTimer: ReturnType<typeof setInterval> | undefined;
let activeSessionId: string | null = null;
let statusBar: StatusBarManager;
let client: DaemonClient;
let errorDetector: ErrorDetector;

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('observerOs');
  return {
    daemonUrl: cfg.get<string>('daemonUrl') ?? 'http://localhost:4000',
    apiKey: cfg.get<string>('apiKey') ?? '',
    pollIntervalMs: cfg.get<number>('pollIntervalMs') ?? 3000,
    showErrorNotifications: cfg.get<boolean>('showErrorNotifications') ?? true,
    // Explorer runs on port 5173 (Vite dev) or built alongside daemon
    explorerUrl: 'http://localhost:5173',
  };
}

async function pollStatus(): Promise<void> {
  const alive = await client.isAlive();
  if (!alive) {
    statusBar.showDisconnected();
    return;
  }

  if (!activeSessionId) {
    statusBar.showConnected(null);
    return;
  }

  try {
    const sessions = await client.listSessions();
    const active = sessions.find(s => s.id === activeSessionId) ?? null;
    statusBar.showConnected(active);
    await errorDetector.checkOnce();
  } catch {
    statusBar.showError('poll failed');
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const cfg = getConfig();
  client = new DaemonClient({ url: cfg.daemonUrl, apiKey: cfg.apiKey || undefined });
  statusBar = new StatusBarManager();

  errorDetector = new ErrorDetector(
    client,
    () => activeSessionId,
    () => getConfig().showErrorNotifications,
  );

  const setActiveSession = (session: { id: string } | null): void => {
    activeSessionId = session?.id ?? null;
    errorDetector.resetSession();
  };

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('observer.copyContext', () =>
      copyContextCommand(client, activeSessionId),
    ),
    vscode.commands.registerCommand('observer.listSessions', () =>
      listSessionsCommand(client, setActiveSession),
    ),
    vscode.commands.registerCommand('observer.startSession', () =>
      startSessionCommand(client, setActiveSession),
    ),
    vscode.commands.registerCommand('observer.openExplorer', () =>
      openExplorerCommand(getConfig().explorerUrl),
    ),
    vscode.commands.registerCommand('observer.refreshStatus', () => pollStatus()),
  );

  // Config change listener — update client when settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('observerOs')) {
        const updated = getConfig();
        client.updateConfig({ url: updated.daemonUrl, apiKey: updated.apiKey || undefined });
        restartPoller(updated.pollIntervalMs);
      }
    }),
  );

  // Status bar + error polling
  function restartPoller(intervalMs: number): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => void pollStatus(), intervalMs);
  }

  restartPoller(cfg.pollIntervalMs);
  void pollStatus(); // immediate first poll

  context.subscriptions.push({ dispose: () => {
    if (pollTimer) clearInterval(pollTimer);
    statusBar.dispose();
    errorDetector.dispose();
  }});
}

export function deactivate(): void {
  if (pollTimer) clearInterval(pollTimer);
}
