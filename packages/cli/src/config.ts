export interface ObserverConfig {
  url: string;
  apiKey?: string;
}

export function loadConfig(overrides?: Partial<ObserverConfig>): ObserverConfig {
  return {
    url: overrides?.url ?? process.env['OBSERVER_URL'] ?? 'http://localhost:4000',
    apiKey: overrides?.apiKey ?? process.env['OBSERVER_API_KEY'],
  };
}
