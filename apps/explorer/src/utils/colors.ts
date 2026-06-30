import type { NodeStatus, Severity } from '../api/types.js';

export const DOMAIN_COLORS: Record<string, string> = {
  browser:  '#3b82f6', // blue-500
  express:  '#10b981', // emerald-500
  nodejs:   '#f59e0b', // amber-500
  react:    '#06b6d4', // cyan-500
  postgres: '#8b5cf6', // violet-500
  redis:    '#ef4444', // red-500
  docker:   '#0ea5e9', // sky-500
};

export const STATUS_STYLES: Record<NodeStatus, { border: string; bg: string; text: string }> = {
  ACTIVE:     { border: '#22c55e', bg: '#052e16', text: '#86efac' },
  DISCOVERED: { border: '#64748b', bg: '#0f172a', text: '#94a3b8' },
  COMPLETED:  { border: '#334155', bg: '#0f172a', text: '#64748b' },
  FAILED:     { border: '#ef4444', bg: '#2d0808', text: '#fca5a5' },
  DESTROYED:  { border: '#1e293b', bg: '#0f172a', text: '#475569' },
  ARCHIVED:   { border: '#1e293b', bg: '#0f172a', text: '#475569' },
};

export const SEVERITY_COLORS: Record<Severity, { bg: string; text: string; dot: string }> = {
  DEBUG: { bg: '#1e293b', text: '#64748b', dot: '#475569' },
  INFO:  { bg: '#0c1a2e', text: '#60a5fa', dot: '#3b82f6' },
  WARN:  { bg: '#1c1400', text: '#fbbf24', dot: '#f59e0b' },
  ERROR: { bg: '#1a0000', text: '#f87171', dot: '#ef4444' },
  FATAL: { bg: '#1a0022', text: '#e879f9', dot: '#c026d3' },
};

export function domainColor(domain: string): string {
  return DOMAIN_COLORS[domain] ?? '#64748b';
}
