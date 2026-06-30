import type { Session, RuntimeNode, RuntimeEvent } from '../types/index.js';
import type { SessionId } from '../types/ids.js';

export interface SessionSearchQuery {
  q?: string;      // text match on session.name (case-insensitive)
  domain?: string; // node.domain filter
  status?: string; // session.status filter
  tag?: string;    // session.tags includes
  from?: number;   // session.startedAt >= from (epoch ms)
  to?: number;     // session.startedAt <= to (epoch ms)
}

export interface SessionMatchMeta {
  failedNodeCount: number;
  matchedTags: string[];
  topEventTypes: { type: string; count: number }[];  // top 3
  topNodeDomains: { domain: string; count: number }[]; // top 3
}

export interface SessionSearchResult {
  session: Session;
  matches: SessionMatchMeta;
}

export class SessionSearcher {
  search(
    query: SessionSearchQuery,
    sessions: Session[],
    getNodes: (sessionId: SessionId) => RuntimeNode[],
    getEvents: (sessionId: SessionId) => RuntimeEvent[],
  ): SessionSearchResult[] {
    const { q, domain, status, tag, from, to } = query;

    // Apply cheap filters first (no node/event scan)
    let candidates = sessions.filter((session) => {
      if (status !== undefined && session.status !== status) return false;
      if (tag !== undefined && !session.tags.includes(tag)) return false;
      if (from !== undefined && session.startedAt < from) return false;
      if (to !== undefined && session.startedAt > to) return false;
      // q filter on name — cheap substring match
      if (q !== undefined && !session.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });

    const results: SessionSearchResult[] = [];

    for (const session of candidates) {
      const needsNodeScan = domain !== undefined;
      const nodes = (q !== undefined || needsNodeScan) ? getNodes(session.id) : [];

      // domain filter: any node must have matching domain
      if (domain !== undefined) {
        const hasDomain = nodes.some((n) => n.domain === domain);
        if (!hasDomain) continue;
      }

      // Build match metadata
      const allNodes = nodes.length > 0 ? nodes : getNodes(session.id);
      const failedNodeCount = allNodes.filter((n) => n.status === 'FAILED').length;

      // matchedTags: tags on the session that match the tag query (or all if no tag filter)
      const matchedTags = tag !== undefined
        ? session.tags.filter((t) => t === tag)
        : [...session.tags];

      // Scan events (capped at 500)
      const events = getEvents(session.id).slice(0, 500);

      // topEventTypes: count by event type, return top 3
      const eventTypeCounts = new Map<string, number>();
      for (const ev of events) {
        eventTypeCounts.set(ev.type, (eventTypeCounts.get(ev.type) ?? 0) + 1);
      }
      const topEventTypes = Array.from(eventTypeCounts.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      // topNodeDomains: count by domain, return top 3
      const domainCounts = new Map<string, number>();
      for (const n of allNodes) {
        domainCounts.set(n.domain, (domainCounts.get(n.domain) ?? 0) + 1);
      }
      const topNodeDomains = Array.from(domainCounts.entries())
        .map(([domain, count]) => ({ domain, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      results.push({
        session,
        matches: {
          failedNodeCount,
          matchedTags,
          topEventTypes,
          topNodeDomains,
        },
      });
    }

    // Sort by startedAt DESC
    results.sort((a, b) => b.session.startedAt - a.session.startedAt);

    return results;
  }
}
