import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DaemonClient } from '../DaemonClient.js';

// Mock vscode before importing commands
vi.mock('vscode', () => {
  const mock = {
    window: {
      showErrorMessage: vi.fn().mockResolvedValue(undefined),
      showInformationMessage: vi.fn().mockResolvedValue(undefined),
      showWarningMessage: vi.fn().mockResolvedValue(undefined),
      showQuickPick: vi.fn(),
      showInputBox: vi.fn(),
      withProgress: vi.fn(async (_opts: unknown, task: () => Promise<void>) => task()),
    },
    env: {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      openExternal: vi.fn().mockResolvedValue(undefined),
    },
    Uri: { parse: vi.fn((s: string) => s) },
    ProgressLocation: { Notification: 15 },
    commands: { executeCommand: vi.fn() },
  };
  return { ...mock, default: mock };
});

import { copyContextCommand } from '../commands/copyContext.js';
import { listSessionsCommand, startSessionCommand } from '../commands/manageSessions.js';
import vscode from 'vscode';

function mockClient(overrides: Partial<DaemonClient> = {}): DaemonClient {
  return {
    listSessions: vi.fn().mockResolvedValue([]),
    createSession: vi.fn(),
    getNodes: vi.fn().mockResolvedValue([]),
    getContext: vi.fn(),
    isAlive: vi.fn().mockResolvedValue(true),
    updateConfig: vi.fn(),
    ...overrides,
  } as unknown as DaemonClient;
}

describe('copyContextCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows warning when no session selected', async () => {
    const client = mockClient();
    await copyContextCommand(client, null);
    expect(vscode.window.showWarningMessage).toHaveBeenCalled();
  });

  it('shows info when no nodes in session', async () => {
    const client = mockClient({ getNodes: vi.fn().mockResolvedValue([]) });
    await copyContextCommand(client, 'ses1');
    expect(vscode.window.showInformationMessage).toHaveBeenCalled();
  });

  it('shows quick pick with FAILED nodes first', async () => {
    const nodes = [
      { id: 'n1', type: 'express:Route', domain: 'express', status: 'ACTIVE', createdAt: 1 },
      { id: 'n2', type: 'postgres:Query', domain: 'postgres', status: 'FAILED', createdAt: 2 },
    ];
    const client = mockClient({
      getNodes: vi.fn().mockResolvedValue(nodes),
      getContext: vi.fn().mockResolvedValue({ markdownContent: '# ctx', tokenEstimate: 100 }),
    });
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ nodeId: 'n2', label: 'postgres:Query' } as never);
    await copyContextCommand(client, 'ses1');
    const items = vi.mocked(vscode.window.showQuickPick).mock.calls[0]?.[0] as Array<{ nodeId: string }>;
    expect(items[0]?.nodeId).toBe('n2'); // FAILED node first
  });

  it('writes context to clipboard', async () => {
    const nodes = [{ id: 'n1', type: 'express:Route', domain: 'express', status: 'FAILED', createdAt: 1 }];
    const client = mockClient({
      getNodes: vi.fn().mockResolvedValue(nodes),
      getContext: vi.fn().mockResolvedValue({ markdownContent: '# Context Data', tokenEstimate: 200 }),
    });
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ nodeId: 'n1', label: 'express:Route' } as never);
    await copyContextCommand(client, 'ses1');
    expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith('# Context Data');
  });
});

describe('listSessionsCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error when daemon unreachable', async () => {
    const client = mockClient({ listSessions: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
    await listSessionsCommand(client, vi.fn());
    expect(vscode.window.showErrorMessage).toHaveBeenCalled();
  });

  it('shows info + start button when no sessions', async () => {
    const client = mockClient({ listSessions: vi.fn().mockResolvedValue([]) });
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as never);
    await listSessionsCommand(client, vi.fn());
    expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
      expect.stringContaining('no sessions'),
      'Start Session',
    );
  });

  it('calls onSelect with chosen session', async () => {
    const session = { id: 'abc', name: 'test', status: 'ACTIVE', nodeCount: 1, eventCount: 2 };
    const client = mockClient({ listSessions: vi.fn().mockResolvedValue([session]) });
    const onSelect = vi.fn();
    vi.mocked(vscode.window.showQuickPick).mockResolvedValue({ session } as never);
    await listSessionsCommand(client, onSelect);
    expect(onSelect).toHaveBeenCalledWith(session);
  });
});

describe('startSessionCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createSession with entered name', async () => {
    const session = { id: 'new', name: 'my run', status: 'ACTIVE', nodeCount: 0, eventCount: 0 };
    const client = mockClient({ createSession: vi.fn().mockResolvedValue(session) });
    vi.mocked(vscode.window.showInputBox).mockResolvedValue('my run');
    const onCreated = vi.fn();
    await startSessionCommand(client, onCreated);
    expect(client.createSession).toHaveBeenCalledWith('my run');
    expect(onCreated).toHaveBeenCalledWith(session);
  });

  it('does nothing when input box cancelled', async () => {
    const client = mockClient();
    vi.mocked(vscode.window.showInputBox).mockResolvedValue(undefined);
    await startSessionCommand(client, vi.fn());
    expect(client.createSession).not.toHaveBeenCalled();
  });
});
