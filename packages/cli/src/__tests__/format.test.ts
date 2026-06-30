import { describe, it, expect } from 'vitest';
import { formatTable, formatJson } from '../format.js';

describe('formatTable', () => {
  it('returns header only for empty rows', () => {
    const out = formatTable([], ['id', 'name']);
    expect(out).toContain('id');
    expect(out).toContain('name');
  });

  it('pads columns to max width', () => {
    const rows = [{ id: 'abc123', name: 'my-session' }];
    const out = formatTable(rows, ['id', 'name']);
    expect(out).toContain('abc123');
    expect(out).toContain('my-session');
  });

  it('handles multiple rows', () => {
    const rows = [{ x: '1' }, { x: '22' }, { x: '333' }];
    const lines = formatTable(rows, ['x']).split('\n');
    expect(lines.length).toBe(5); // header + divider + 3 rows
  });

  it('missing field renders as empty string', () => {
    const rows = [{ id: 'abc', name: undefined }];
    const out = formatTable(rows as never, ['id', 'name']);
    expect(out).not.toContain('undefined');
  });
});

describe('formatJson', () => {
  it('returns pretty-printed JSON', () => {
    const out = formatJson({ a: 1 });
    expect(out).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it('handles arrays', () => {
    const out = formatJson([1, 2, 3]);
    expect(JSON.parse(out)).toEqual([1, 2, 3]);
  });
});
