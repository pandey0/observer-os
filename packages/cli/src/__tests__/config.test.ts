import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  let origUrl: string | undefined;
  let origKey: string | undefined;

  beforeEach(() => {
    origUrl = process.env['OBSERVER_URL'];
    origKey = process.env['OBSERVER_API_KEY'];
  });

  afterEach(() => {
    if (origUrl === undefined) delete process.env['OBSERVER_URL'];
    else process.env['OBSERVER_URL'] = origUrl;
    if (origKey === undefined) delete process.env['OBSERVER_API_KEY'];
    else process.env['OBSERVER_API_KEY'] = origKey;
  });

  it('defaults to localhost:4000', () => {
    delete process.env['OBSERVER_URL'];
    delete process.env['OBSERVER_API_KEY'];
    expect(loadConfig().url).toBe('http://localhost:4000');
  });

  it('reads OBSERVER_URL', () => {
    process.env['OBSERVER_URL'] = 'http://prod:4000';
    expect(loadConfig().url).toBe('http://prod:4000');
  });

  it('reads OBSERVER_API_KEY', () => {
    process.env['OBSERVER_API_KEY'] = 'secret-key';
    expect(loadConfig().apiKey).toBe('secret-key');
  });

  it('overrides take precedence over env vars', () => {
    process.env['OBSERVER_URL'] = 'http://env:4000';
    expect(loadConfig({ url: 'http://override:4000' }).url).toBe('http://override:4000');
  });

  it('apiKey undefined when not set', () => {
    delete process.env['OBSERVER_API_KEY'];
    expect(loadConfig().apiKey).toBeUndefined();
  });
});
