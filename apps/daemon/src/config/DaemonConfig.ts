import { homedir } from 'os';
import { join } from 'path';

export interface DaemonConfig {
  readonly port: number;
  readonly host: string;
  readonly storagePath: string;
  readonly logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  readonly corsOrigins: string[];
  readonly maxEventsPerPage: number;
  readonly apiKey?: string;
}

export const DEFAULT_CONFIG: DaemonConfig = {
  port: 4000,
  host: '127.0.0.1',
  storagePath: join(homedir(), '.observer'),
  logLevel: 'info',
  corsOrigins: ['http://localhost:3000', 'http://localhost:5173'],
  maxEventsPerPage: 500,
};

export function resolveConfig(overrides: Partial<DaemonConfig> = {}): DaemonConfig {
  const fromEnv: Partial<DaemonConfig> = {
    port: process.env['OBSERVER_PORT'] ? Number(process.env['OBSERVER_PORT']) : undefined,
    host: process.env['OBSERVER_HOST'],
    storagePath: process.env['OBSERVER_STORAGE_PATH'],
    apiKey: process.env['OBSERVER_API_KEY'],
  };
  // Strip undefined so spread doesn't overwrite defaults
  const clean = Object.fromEntries(
    Object.entries(fromEnv).filter(([, v]) => v !== undefined)
  ) as Partial<DaemonConfig>;

  return { ...DEFAULT_CONFIG, ...clean, ...overrides };
}
