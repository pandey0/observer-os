export function tryRequire(name: string): unknown {
  // Try resolving from the app's cwd first (when used as --require hook),
  // then fall back to the package's own resolution chain.
  const paths = [process.cwd(), __dirname];
  for (const basePath of paths) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const resolved = require.resolve(name, { paths: [basePath] });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(resolved);
    } catch {
      // try next path
    }
  }
  return null;
}

export function isAvailable(name: string): boolean {
  const paths = [process.cwd(), __dirname];
  for (const basePath of paths) {
    try {
      require.resolve(name, { paths: [basePath] });
      return true;
    } catch {
      // try next path
    }
  }
  return false;
}
