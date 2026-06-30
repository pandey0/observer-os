import { describe, it, expect } from 'vitest';
import { parseStackFrames, extractStack } from '../pipeline/parseStackFrames.js';

describe('parseStackFrames', () => {
  it('parses V8 "at fn (file:line:col)" format', () => {
    const stack = `Error: something broke
    at UserController.createOrder (src/controllers/user.ts:42:18)
    at Layer.handle [as handle_request] (node_modules/express/lib/router/layer.js:95:5)
    at next (node_modules/express/lib/router/route.js:144:13)`;

    const frames = parseStackFrames(stack);
    expect(frames).toHaveLength(3);
    expect(frames[0]).toEqual({ fn: 'UserController.createOrder', file: 'src/controllers/user.ts', line: 42, column: 18 });
    expect(frames[1]).toEqual({ fn: 'Layer.handle [as handle_request]', file: 'node_modules/express/lib/router/layer.js', line: 95, column: 5 });
  });

  it('parses V8 anonymous "at file:line:col" format', () => {
    const stack = `    at src/index.ts:10:5`;
    const frames = parseStackFrames(stack);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual({ fn: '<anonymous>', file: 'src/index.ts', line: 10, column: 5 });
  });

  it('parses Firefox "fn@file:line:col" format', () => {
    const stack = `createOrder@src/controllers/user.ts:42:18\nnext@node_modules/express/lib/router/route.js:144:13`;
    const frames = parseStackFrames(stack);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toEqual({ fn: 'createOrder', file: 'src/controllers/user.ts', line: 42, column: 18 });
  });

  it('returns empty array for empty string', () => {
    expect(parseStackFrames('')).toEqual([]);
  });

  it('returns empty array for stack with no frame lines', () => {
    expect(parseStackFrames('Error: something\nNo frames here')).toEqual([]);
  });

  it('handles mixed V8 and non-frame lines', () => {
    const stack = `TypeError: Cannot read properties of undefined
    at Object.<anonymous> (src/app.ts:5:1)
    at Module._compile (node:internal/modules/cjs/loader:1376:14)`;
    const frames = parseStackFrames(stack);
    expect(frames).toHaveLength(2);
    expect(frames[0]?.fn).toBe('Object.<anonymous>');
  });
});

describe('extractStack', () => {
  it('extracts from errorStack key', () => {
    const payload = { errorStack: 'Error: x\n    at fn (file.ts:1:2)' };
    expect(extractStack(payload)).toBe(payload.errorStack);
  });

  it('extracts from nested error.stack key', () => {
    const payload = { error: { stack: 'Error: x\n    at fn (file.ts:1:2)', message: 'x' } };
    expect(extractStack(payload)).toBe('Error: x\n    at fn (file.ts:1:2)');
  });

  it('returns null when no stack present', () => {
    expect(extractStack({ message: 'oops', code: 42 })).toBeNull();
  });

  it('returns null for single-line strings (not a stack)', () => {
    expect(extractStack({ stack: 'just one line' })).toBeNull();
  });
});
