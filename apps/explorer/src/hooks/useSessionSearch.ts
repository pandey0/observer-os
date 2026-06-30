import { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import type { SessionSearchResult } from '../api/types.js';

export function useSessionSearch(query: string): SessionSearchResult[] {
  const [results, setResults] = useState<SessionSearchResult[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    api.sessions.search({ q: query })
      .then((r) => setResults(r.results))
      .catch(() => setResults([]));
  }, [query]);

  return results;
}
