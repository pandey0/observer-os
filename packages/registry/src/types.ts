export interface PluginEntry {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: 'frontend' | 'backend' | 'database' | 'framework' | 'api' | 'other';
  tags: string[];
  version: string;
  verified: boolean;
  firstParty: boolean;
  homepage: string;
  runtimes: string[];
  nodeTypes: string[];
}

export interface Registry {
  schemaVersion: string;
  updatedAt: string;
  plugins: PluginEntry[];
}

export interface SearchOptions {
  query?: string;         // matches name, displayName, description, tags
  category?: string;
  runtime?: string;
  firstParty?: boolean;
  verified?: boolean;
}
