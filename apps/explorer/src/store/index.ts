import { create } from 'zustand';
import type { ApiSession, RuntimeNode, RuntimeEvent, PerformanceReport } from '../api/types.js';

export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
export type DaemonStatus = 'unknown' | 'online' | 'offline';

interface ObserverStore {
  // Daemon
  daemonStatus: DaemonStatus;
  setDaemonStatus(s: DaemonStatus): void;

  // Sessions
  sessions: ApiSession[];
  activeSessionId: string | null;
  setSessions(sessions: ApiSession[]): void;
  upsertSession(session: ApiSession): void;
  setActiveSession(id: string | null): void;

  // Graph data (for active session)
  nodes: RuntimeNode[];
  events: RuntimeEvent[];
  wsStatus: WsStatus;
  wsReconnectAttempt: number;
  setNodes(nodes: RuntimeNode[]): void;
  upsertNode(node: RuntimeNode): void;
  setEvents(events: RuntimeEvent[]): void;
  appendEvent(event: RuntimeEvent): void;
  setWsStatus(s: WsStatus): void;
  setWsReconnectAttempt(n: number): void;
  clearSessionData(): void;

  // Selection (inspector)
  selectedNodeId: string | null;
  setSelectedNode(id: string | null): void;

  // Replay
  replayCursor: number | null;  // null = live mode; number = timestamp ceiling
  setReplayCursor(ts: number | null): void;

  // Performance report
  performanceReport: PerformanceReport | null;
  setPerformanceReport(report: PerformanceReport | null): void;
}

export const useStore = create<ObserverStore>((set) => ({
  // Daemon
  daemonStatus: 'unknown',
  setDaemonStatus: (daemonStatus) => set({ daemonStatus }),

  // Sessions
  sessions: [],
  activeSessionId: null,
  setSessions: (sessions) => set({ sessions }),
  upsertSession: (session) =>
    set((s) => ({
      sessions: s.sessions.some((x) => x.id === session.id)
        ? s.sessions.map((x) => (x.id === session.id ? session : x))
        : [...s.sessions, session],
    })),
  setActiveSession: (activeSessionId) =>
    set({ activeSessionId, selectedNodeId: null }),

  // Graph data
  nodes: [],
  events: [],
  wsStatus: 'disconnected',
  wsReconnectAttempt: 0,
  setNodes: (nodes) => set({ nodes: (nodes ?? []).filter(Boolean) }),
  upsertNode: (node) => {
    if (!node?.id) return;
    set((s) => {
      const safe = s.nodes.filter((n): n is NonNullable<typeof n> => !!n?.id);
      return {
        nodes: safe.some((n) => n.id === node.id)
          ? safe.map((n) => (n.id === node.id ? node : n))
          : [...safe, node],
      };
    });
  },
  setEvents: (events) => set({ events: (events ?? []).filter(Boolean) }),
  appendEvent: (event) => {
    if (!event) return;
    set((s) => ({ events: [...s.events, event] }));
  },
  setWsStatus: (wsStatus) => set({ wsStatus }),
  setWsReconnectAttempt: (wsReconnectAttempt) => set({ wsReconnectAttempt }),
  clearSessionData: () =>
    set({ nodes: [], events: [], wsStatus: 'disconnected', wsReconnectAttempt: 0, selectedNodeId: null, replayCursor: null, performanceReport: null }),

  // Selection
  selectedNodeId: null,
  setSelectedNode: (selectedNodeId) => set({ selectedNodeId }),

  // Replay
  replayCursor: null,
  setReplayCursor: (replayCursor) => set({ replayCursor }),

  // Performance report
  performanceReport: null,
  setPerformanceReport: (performanceReport) => set({ performanceReport }),
}));
