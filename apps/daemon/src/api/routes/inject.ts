import type { FastifyInstance } from 'fastify';

export function registerInjectRoute(app: FastifyInstance, daemonPort: number): void {
  app.get('/observer.js', async (req, reply) => {
    // Detect daemon URL from request host or fall back to localhost
    const host = req.headers['host'] ?? `localhost:${daemonPort}`;
    const protocol = req.headers['x-forwarded-proto'] ?? 'http';
    const daemonUrl = `${protocol as string}://${host}`;

    const script = generateInjectScript(daemonUrl);
    void reply.header('content-type', 'application/javascript; charset=utf-8');
    void reply.header('cache-control', 'no-cache');
    return reply.send(script);
  });
}

function generateInjectScript(daemonUrl: string): string {
  return `/* Observer OS — Browser Inject v1.0 */
(function() {
  'use strict';
  var DAEMON = ${JSON.stringify(daemonUrl)};
  var SESSION_ID = null;
  var QUEUE = [];
  var CONNECTED = false;
  var EMITTING = false; // prevent recursive emit on fetch patch

  function emit(event) {
    if (!CONNECTED || !SESSION_ID) { QUEUE.push(event); return; }
    if (EMITTING) return;
    EMITTING = true;
    _origFetch(DAEMON + '/api/sessions/' + SESSION_ID + '/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    }).catch(function() {}).finally(function() { EMITTING = false; });
  }

  // Store original fetch before patching
  var _origFetch = window.fetch ? window.fetch.bind(window) : null;

  // Bootstrap: get or create default session
  if (_origFetch) {
    _origFetch(DAEMON + '/api/sessions/default')
      .then(function(r) { return r.json(); })
      .then(function(s) {
        SESSION_ID = s.id;
        CONNECTED = true;
        QUEUE.forEach(function(e) { emit(e); });
        QUEUE = [];
        console.info('[Observer OS] connected — session:', SESSION_ID);
      })
      .catch(function(err) {
        console.warn('[Observer OS] could not connect to daemon at ' + DAEMON + ':', err.message);
      });
  }

  // ─── Patch window.fetch ───────────────────────────────────────────────────
  if (_origFetch) {
    window.fetch = function observerFetch(input, init) {
      var url = typeof input === 'string' ? input
              : input instanceof Request ? input.url
              : String(input);
      // Skip Observer's own requests
      if (url.startsWith(DAEMON)) return _origFetch(input, init);

      var method = (init && init.method ? init.method : 'GET').toUpperCase();
      var nodeId = 'browser:fetch:' + url.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50);
      var startedAt = Date.now();

      emit({
        type: 'observer.browser/fetch.started',
        sourceNodeId: nodeId,
        occurredAt: startedAt,
        severity: 'DEBUG',
        payload: { url: url, method: method },
      });

      return _origFetch(input, init).then(function(res) {
        var duration = Date.now() - startedAt;
        emit({
          type: res.ok ? 'observer.browser/fetch.completed' : 'observer.browser/fetch.failed',
          sourceNodeId: nodeId,
          occurredAt: Date.now(),
          severity: res.ok ? 'INFO' : res.status >= 500 ? 'ERROR' : 'WARN',
          payload: { url: url, method: method, status: res.status, duration: duration, durationMs: duration },
        });
        return res;
      }).catch(function(err) {
        var duration = Date.now() - startedAt;
        emit({
          type: 'observer.browser/fetch.failed',
          sourceNodeId: nodeId,
          occurredAt: Date.now(),
          severity: 'ERROR',
          payload: { url: url, method: method, error: String(err), duration: duration, durationMs: duration },
        });
        throw err;
      });
    };
  }

  // ─── WebSocket ────────────────────────────────────────────────────────────
  var _OrigWebSocket = window.WebSocket;
  if (_OrigWebSocket) {
    function ObserverWebSocket(url, protocols) {
      var ws = protocols !== undefined ? new _OrigWebSocket(url, protocols) : new _OrigWebSocket(url);
      var nodeId = 'browser:ws:' + String(url).replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50);

      ws.addEventListener('open', function() {
        emit({ type: 'observer.browser/ws.connected', sourceNodeId: nodeId, occurredAt: Date.now(), severity: 'INFO', payload: { url: String(url) } });
      });
      ws.addEventListener('close', function(e) {
        emit({ type: 'observer.browser/ws.disconnected', sourceNodeId: nodeId, occurredAt: Date.now(), severity: e.wasClean ? 'INFO' : 'WARN', payload: { url: String(url), code: e.code, reason: e.reason || '', wasClean: e.wasClean } });
      });
      ws.addEventListener('error', function() {
        emit({ type: 'observer.browser/ws.error', sourceNodeId: nodeId, occurredAt: Date.now(), severity: 'ERROR', payload: { url: String(url) } });
      });
      ws.addEventListener('message', function(e) {
        var size = typeof e.data === 'string' ? e.data.length : (e.data instanceof ArrayBuffer ? e.data.byteLength : 0);
        emit({ type: 'observer.browser/ws.message.received', sourceNodeId: nodeId, occurredAt: Date.now(), severity: 'DEBUG', payload: { url: String(url), size: size } });
      });

      var _origSend = ws.send.bind(ws);
      ws.send = function(data) {
        var size = typeof data === 'string' ? data.length : (data instanceof ArrayBuffer ? data.byteLength : 0);
        emit({ type: 'observer.browser/ws.message.sent', sourceNodeId: nodeId, occurredAt: Date.now(), severity: 'DEBUG', payload: { url: String(url), size: size } });
        return _origSend(data);
      };

      return ws;
    }
    ObserverWebSocket.prototype = _OrigWebSocket.prototype;
    ObserverWebSocket.CONNECTING = _OrigWebSocket.CONNECTING;
    ObserverWebSocket.OPEN = _OrigWebSocket.OPEN;
    ObserverWebSocket.CLOSING = _OrigWebSocket.CLOSING;
    ObserverWebSocket.CLOSED = _OrigWebSocket.CLOSED;
    window.WebSocket = ObserverWebSocket;
  }

  // ─── XMLHttpRequest ────────────────────────────────────────────────────────
  var _OrigXHR = window.XMLHttpRequest;
  if (_OrigXHR) {
    window.XMLHttpRequest = function ObserverXHR() {
      var xhr = new _OrigXHR();
      var _method = 'GET', _url = '';
      var _nodeId = '';
      var _startedAt = 0;

      var origOpen = xhr.open.bind(xhr);
      xhr.open = function(method, url) {
        _method = method;
        _url = String(url);
        _nodeId = 'browser:xhr:' + _url.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50);
        origOpen.apply(xhr, arguments);
      };

      var origSend = xhr.send.bind(xhr);
      xhr.send = function() {
        if (_url.startsWith(DAEMON)) { origSend.apply(xhr, arguments); return; }
        _startedAt = Date.now();
        emit({ type: 'observer.browser/xhr.started', sourceNodeId: _nodeId, occurredAt: _startedAt, severity: 'DEBUG', payload: { method: _method, url: _url } });
        origSend.apply(xhr, arguments);
      };

      xhr.addEventListener('load', function() {
        var duration = Date.now() - _startedAt;
        emit({ type: xhr.status >= 500 ? 'observer.browser/xhr.failed' : 'observer.browser/xhr.completed', sourceNodeId: _nodeId, occurredAt: Date.now(), severity: xhr.status >= 500 ? 'ERROR' : xhr.status >= 400 ? 'WARN' : 'INFO', payload: { method: _method, url: _url, status: xhr.status, duration: duration } });
      });

      xhr.addEventListener('error', function() {
        emit({ type: 'observer.browser/xhr.failed', sourceNodeId: _nodeId, occurredAt: Date.now(), severity: 'ERROR', payload: { method: _method, url: _url, error: 'network error', duration: Date.now() - _startedAt } });
      });

      return xhr;
    };
    window.XMLHttpRequest.prototype = _OrigXHR.prototype;
  }

  // ─── console.error ────────────────────────────────────────────────────────
  var _origConsoleError = console.error.bind(console);
  console.error = function observerConsoleError() {
    _origConsoleError.apply(console, arguments);
    var msg = Array.from(arguments).map(function(a) {
      try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch { return String(a); }
    }).join(' ').slice(0, 500);
    emit({
      type: 'observer.browser/console.error',
      sourceNodeId: 'browser:console',
      occurredAt: Date.now(),
      severity: 'ERROR',
      payload: { message: msg },
    });
  };

  // ─── Unhandled promise rejections ─────────────────────────────────────────
  window.addEventListener('unhandledrejection', function(e) {
    emit({
      type: 'observer.browser/unhandled-rejection',
      sourceNodeId: 'browser:window',
      occurredAt: Date.now(),
      severity: 'ERROR',
      payload: { reason: String(e.reason).slice(0, 500) },
    });
  });

  // ─── JS errors ────────────────────────────────────────────────────────────
  window.addEventListener('error', function(e) {
    if (e.filename) { // only script errors, not resource load errors
      emit({
        type: 'observer.browser/js-error',
        sourceNodeId: 'browser:window',
        occurredAt: Date.now(),
        severity: 'ERROR',
        payload: { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno },
      });
    }
  });

  // ─── Navigation ───────────────────────────────────────────────────────────
  var _origPushState = history.pushState.bind(history);
  history.pushState = function observerPushState(state, title, url) {
    _origPushState(state, title, url);
    emit({
      type: 'observer.browser/navigation',
      sourceNodeId: 'browser:navigation',
      occurredAt: Date.now(),
      severity: 'INFO',
      payload: { url: String(url), type: 'pushState' },
    });
  };
})();
`;
}
