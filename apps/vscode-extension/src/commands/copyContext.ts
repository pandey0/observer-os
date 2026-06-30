import * as vscode from 'vscode';
import type { DaemonClient } from '../DaemonClient.js';

export async function copyContextCommand(client: DaemonClient, sessionId: string | null): Promise<void> {
  if (!sessionId) {
    vscode.window.showWarningMessage('Observer: no active session selected. Use "Observer: List Sessions" first.');
    return;
  }

  let nodes;
  try {
    nodes = await client.getNodes(sessionId);
  } catch {
    vscode.window.showErrorMessage('Observer: cannot reach daemon.');
    return;
  }

  if (nodes.length === 0) {
    vscode.window.showInformationMessage('Observer: no nodes in session yet.');
    return;
  }

  // Prioritize FAILED nodes for anchor
  const sorted = [...nodes].sort((a, b) => {
    if (a.status === 'FAILED' && b.status !== 'FAILED') return -1;
    if (b.status === 'FAILED' && a.status !== 'FAILED') return 1;
    return 0;
  });

  const items = sorted.map(n => ({
    label: n.type,
    description: `${n.domain} · ${n.status}`,
    detail: n.id,
    nodeId: n.id,
    picked: n.status === 'FAILED',
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select node to copy context from (FAILED nodes shown first)',
    title: 'Observer: Copy Runtime Context',
  });

  if (!picked) return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Observer: building context…', cancellable: false },
    async () => {
      try {
        const pkg = await client.getContext(sessionId, picked.nodeId);
        await vscode.env.clipboard.writeText(pkg.markdownContent);
        vscode.window.showInformationMessage(
          `Observer: context copied (~${pkg.tokenEstimate} tokens). Paste into your AI assistant.`,
        );
      } catch (err) {
        vscode.window.showErrorMessage(`Observer: context failed — ${String(err)}`);
      }
    },
  );
}
