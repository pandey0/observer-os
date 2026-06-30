/**
 * Render an ASCII table from an array of row objects.
 * Only the specified columns are included. Missing values render as empty string.
 */
export function formatTable(rows: Record<string, unknown>[], columns: string[]): string {
  // Compute column widths: start with header widths
  const widths: number[] = columns.map((c) => c.length);

  for (const row of rows) {
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      if (col === undefined) continue;
      const val = String(row[col] ?? '');
      if (val.length > (widths[i] ?? 0)) {
        widths[i] = val.length;
      }
    }
  }

  const pad = (s: string, w: number): string => s.padEnd(w);

  const separator = widths.map((w) => '-'.repeat(w)).join('  ');
  const header = columns.map((c, i) => pad(c, widths[i] ?? c.length)).join('  ');

  const lines: string[] = [header, separator];

  for (const row of rows) {
    const line = columns.map((c, i) => pad(String(row[c] ?? ''), widths[i] ?? 0)).join('  ');
    lines.push(line);
  }

  return lines.join('\n');
}

export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
