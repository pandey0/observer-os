#!/usr/bin/env node
import { ObserverDaemon } from './daemon/ObserverDaemon.js';
import { BrowserObserverPlugin } from '@observer-os/plugin-browser';

const daemon = new ObserverDaemon();

// Register first-party plugins
daemon.use(new BrowserObserverPlugin(), {
  bridgePort: 7891,        // browser inject script + event receiver
  corsOrigins: ['*'],      // restrict in production
});

daemon.start()
  .then(() => {
    const { host, port } = daemon.config;
    process.stdout.write([
      '',
      '  Observer OS',
      `  API   →  http://${host}:${port}/api`,
      `  WS    →  ws://${host}:${port}/ws/sessions/:id`,
      `  Bridge→  http://${host}:7891`,
      '',
      '  Inject script (add to your page):',
      `  <script src="http://${host}:7891/observer-inject.js"></script>`,
      '',
    ].join('\n'));
  })
  .catch(err => {
    process.stderr.write(`Failed to start: ${err}\n`);
    process.exit(1);
  });
