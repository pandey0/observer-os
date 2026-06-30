import { AsyncLocalStorage } from 'async_hooks';

export const correlationStorage = new AsyncLocalStorage<string>();

let _seq = 0;
export function newCorrelationId(): string {
  return `cor_${Date.now().toString(36)}_${(++_seq).toString(36)}`;
}
