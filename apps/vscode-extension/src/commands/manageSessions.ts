import * as vscode from 'vscode';
import type { DaemonClient, ApiSession } from '../DaemonClient.js';

export async function listSessionsCommand(
  client: DaemonClient,
  onSelect: (session: ApiSession) => void,
): Promise<void> {
  let sessions: ApiSession[];
  try {
    sessions = await client.listSessions();
  } catch {
    vscode.window.showErrorMessage('Observer: cannot reach daemon. Is it running?');
    return;
  }

  if (sessions.length === 0) {
    const action = await vscode.window.showInformationMessage('Observer: no sessions found.', 'Start Session');
    if (action === 'Start Session') await startSessionCommand(client, onSelect);
    return;
  }

  const items = sessions.map(s => ({
    label: s.name ?? s.id.slice(0, 12),
    description: `${s.status} · ${s.nodeCount} nodes · ${s.eventCount} events`,
    detail: s.id,
    session: s,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select an Observer session',
    title: 'Observer Sessions',
  });

  if (picked) onSelect(picked.session);
}

export async function startSessionCommand(
  client: DaemonClient,
  onCreated: (session: ApiSession) => void,
): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: 'Session name (optional)',
    placeHolder: 'e.g. debug checkout flow',
    title: 'Observer: Start Session',
  });

  if (name === undefined) return; // cancelled

  try {
    const session = await client.createSession(name || undefined);
    onCreated(session);
    vscode.window.showInformationMessage(`Observer: session "${session.name ?? session.id.slice(0, 8)}" started`);
  } catch (err) {
    vscode.window.showErrorMessage(`Observer: failed to create session — ${String(err)}`);
  }
}
