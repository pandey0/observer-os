import { describe, it, expect } from 'vitest';
import { runWithNextCorrelation, getNextCorrelationId } from '../instrumentation/alsContext.js';

describe('alsContext', () => {
  it('returns undefined when no context is active', () => {
    expect(getNextCorrelationId()).toBeUndefined();
  });

  it('makes the correlationId available inside the run callback', () => {
    let captured: string | undefined;
    runWithNextCorrelation('trace-123', () => {
      captured = getNextCorrelationId();
    });
    expect(captured).toBe('trace-123');
  });

  it('propagates the id through async boundaries', async () => {
    let captured: string | undefined;
    await runWithNextCorrelation('async-456', async () => {
      await Promise.resolve();
      captured = getNextCorrelationId();
    });
    expect(captured).toBe('async-456');
  });

  it('propagates through nested awaited microtasks', async () => {
    const ids: Array<string | undefined> = [];
    await runWithNextCorrelation('deep-789', async () => {
      ids.push(getNextCorrelationId());
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      ids.push(getNextCorrelationId());
    });
    expect(ids).toEqual(['deep-789', 'deep-789']);
  });

  it('does not leak the context outside the run callback', () => {
    runWithNextCorrelation('should-not-leak', () => {
      // intentionally empty — just runs synchronously
    });
    expect(getNextCorrelationId()).toBeUndefined();
  });

  it('supports nested contexts — inner context takes precedence', () => {
    let inner: string | undefined;
    let outer: string | undefined;
    runWithNextCorrelation('outer', () => {
      outer = getNextCorrelationId();
      runWithNextCorrelation('inner', () => {
        inner = getNextCorrelationId();
      });
    });
    expect(outer).toBe('outer');
    expect(inner).toBe('inner');
  });
});
