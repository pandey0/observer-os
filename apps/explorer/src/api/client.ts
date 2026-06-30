import type {
  ApiSession,
  EventsResponse,
  NodesResponse,
  HealthResponse,
  ContextRequest,
  ContextPackage,
  PerformanceReport,
  SessionSearchResponse,
} from './types.js';

export interface Annotation {
  id: string;
  sessionId: string;
  nodeId?: string;
  eventId?: string;
  text: string;
  author?: string;
  createdAt: number;
}

const BASE = 'http://localhost:4000/api';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function delVoid(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}`);
}

export const api = {
  health: () => get<HealthResponse>('/health'),

  sessions: {
    list: ()               => get<ApiSession[]>('/sessions'),
    create: (name: string) => post<ApiSession>('/sessions', { name }),
    get: (id: string)      => get<ApiSession>(`/sessions/${id}`),
    end: (id: string)      => del<ApiSession>(`/sessions/${id}`),
    pause: (id: string)    => post<ApiSession>(`/sessions/${id}/pause`),
    resume: (id: string)   => post<ApiSession>(`/sessions/${id}/resume`),
    events: (id: string, params?: Record<string, string | number>) => {
      const q = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
      return get<EventsResponse>(`/sessions/${id}/events${q}`);
    },
    nodes: (id: string) => get<NodesResponse>(`/sessions/${id}/nodes`),
    context: (id: string, req: ContextRequest) =>
      post<ContextPackage>(`/sessions/${id}/context`, req),
    performance: (id: string) =>
      get<PerformanceReport>(`/sessions/${id}/performance`),
    search: (params: Record<string, string>) => {
      const q = '?' + new URLSearchParams(params).toString();
      return get<SessionSearchResponse>(`/sessions/search${q}`);
    },
  },

  annotations: {
    list: (sessionId: string) =>
      get<{ annotations: Annotation[] }>(`/sessions/${sessionId}/annotations`),
    create: (sessionId: string, body: { nodeId?: string; text: string; author?: string }) =>
      post<Annotation>(`/sessions/${sessionId}/annotations`, body),
    delete: (sessionId: string, id: string): Promise<void> =>
      delVoid(`/sessions/${sessionId}/annotations/${id}`),
  },
};
