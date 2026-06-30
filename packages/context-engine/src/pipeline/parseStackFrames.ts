import type { SourceFrame } from '../types.js';

// Matches V8 "    at FnName (file.ts:10:5)" and "    at file.ts:10:5"
const V8_FRAME = /^\s*at\s+(?:(.+?)\s+\((.+?):(\d+):(\d+)\)|(.+?):(\d+):(\d+))\s*$/;

// Matches Firefox/Safari "fnName@file.ts:10:5"
const FF_FRAME = /^(.+?)@(.+?):(\d+):(\d+)$/;

export function parseStackFrames(stack: string): SourceFrame[] {
  const frames: SourceFrame[] = [];

  for (const line of stack.split('\n')) {
    const v8 = V8_FRAME.exec(line);
    if (v8) {
      if (v8[2]) {
        // "at fnName (file:line:col)"
        frames.push({ fn: v8[1]?.trim() ?? '<anonymous>', file: v8[2], line: +(v8[3] ?? 0), column: +(v8[4] ?? 0) });
      } else {
        // "at file:line:col"
        frames.push({ fn: '<anonymous>', file: v8[5] ?? '', line: +(v8[6] ?? 0), column: +(v8[7] ?? 0) });
      }
      continue;
    }

    const ff = FF_FRAME.exec(line.trim());
    if (ff) {
      frames.push({ fn: ff[1] ?? '<anonymous>', file: ff[2] ?? '', line: +(ff[3] ?? 0), column: +(ff[4] ?? 0) });
    }
  }

  return frames;
}

/** Extract stack string from RuntimeNode or RuntimeEvent metadata payload */
export function extractStack(payload: Record<string, unknown>): string | null {
  for (const key of ['errorStack', 'stack', 'error', 'stackTrace']) {
    const v = payload[key];
    if (typeof v === 'string' && v.includes('\n') && (v.includes('at ') || v.includes('@'))) {
      return v;
    }
    if (typeof v === 'object' && v !== null) {
      const nested = v as Record<string, unknown>;
      if (typeof nested['stack'] === 'string') return nested['stack'] as string;
    }
  }
  return null;
}
