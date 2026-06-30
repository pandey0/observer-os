import * as vscode from 'vscode';

export async function openExplorerCommand(explorerUrl: string): Promise<void> {
  const uri = vscode.Uri.parse(explorerUrl);
  await vscode.env.openExternal(uri);
}
