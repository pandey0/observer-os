import { randomUUID } from 'node:crypto';

export interface Annotation {
  id: string;
  sessionId: string;
  nodeId?: string;
  eventId?: string;
  text: string;
  author?: string;
  createdAt: number;
}

export class AnnotationStore {
  private readonly store = new Map<string, Annotation[]>();

  add(input: Omit<Annotation, 'id' | 'createdAt'>): Annotation {
    const annotation: Annotation = { ...input, id: randomUUID(), createdAt: Date.now() };
    const existing = this.store.get(input.sessionId) ?? [];
    existing.push(annotation);
    this.store.set(input.sessionId, existing);
    return annotation;
  }

  list(sessionId: string): Annotation[] {
    return this.store.get(sessionId) ?? [];
  }

  delete(sessionId: string, annotationId: string): boolean {
    const existing = this.store.get(sessionId);
    if (!existing) return false;
    const idx = existing.findIndex(a => a.id === annotationId);
    if (idx === -1) return false;
    existing.splice(idx, 1);
    return true;
  }
}
