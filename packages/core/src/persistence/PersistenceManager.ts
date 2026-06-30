import {
  mkdirSync,
  appendFileSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  renameSync,
  statSync,
} from 'fs';
import { join } from 'path';
import type { RuntimeEvent } from '../types/event.js';
import type { Session } from '../types/session.js';

export interface EventWriter {
  writeEvent(event: RuntimeEvent): void;
}

export interface SessionWriter {
  writeSession(session: Session): void;
}

export interface LoadedData {
  readonly sessions: Session[];
  readonly eventsBySession: Map<string, RuntimeEvent[]>;
}

export class PersistenceManager implements EventWriter, SessionWriter {
  private readonly sessionsRoot: string;

  constructor(private readonly dataDir: string) {
    this.sessionsRoot = join(dataDir, 'sessions');
  }

  /** Create data directories. Call once before first write. */
  init(): void {
    mkdirSync(this.sessionsRoot, { recursive: true });
  }

  /** Append event as one NDJSON line. Synchronous for crash safety. */
  writeEvent(event: RuntimeEvent): void {
    const dir = this.sessionDir(event.sessionId as string);
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'events.ndjson'), JSON.stringify(event) + '\n', 'utf8');
  }

  /** Write session metadata atomically (tmp → rename). */
  writeSession(session: Session): void {
    const dir = this.sessionDir(session.id as string);
    mkdirSync(dir, { recursive: true });
    const target = join(dir, 'session.json');
    const tmp    = target + '.tmp';
    writeFileSync(tmp, JSON.stringify(session, null, 2), 'utf8');
    renameSync(tmp, target);
  }

  /** Load all sessions and their events from disk. */
  loadAll(): LoadedData {
    if (!existsSync(this.sessionsRoot)) {
      return { sessions: [], eventsBySession: new Map() };
    }

    const sessions: Session[] = [];
    const eventsBySession = new Map<string, RuntimeEvent[]>();

    let entries: string[];
    try {
      entries = readdirSync(this.sessionsRoot);
    } catch {
      return { sessions: [], eventsBySession: new Map() };
    }

    for (const dirName of entries) {
      const dir = join(this.sessionsRoot, dirName);
      if (!this.isDir(dir)) continue;

      const session = this.readSession(dir);
      if (!session) continue;
      sessions.push(session);

      const events = this.readEvents(dir);
      eventsBySession.set(session.id as string, events);
    }

    // Restore in startedAt order so session list is stable
    sessions.sort((a, b) => a.startedAt - b.startedAt);

    return { sessions, eventsBySession };
  }

  private readSession(dir: string): Session | null {
    const file = join(dir, 'session.json');
    if (!existsSync(file)) return null;
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as Session;
    } catch {
      return null;
    }
  }

  private readEvents(dir: string): RuntimeEvent[] {
    const file = join(dir, 'events.ndjson');
    if (!existsSync(file)) return [];

    let raw: string;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      return [];
    }

    const events: RuntimeEvent[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        events.push(JSON.parse(trimmed) as RuntimeEvent);
      } catch {
        // Skip corrupted lines — partial write on crash
      }
    }
    return events;
  }

  private sessionDir(sessionId: string): string {
    return join(this.sessionsRoot, sessionId);
  }

  private isDir(path: string): boolean {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  }
}
