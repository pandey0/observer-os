import { emit } from './emitter.js';
import { generateW3CTraceId, generateW3CSpanId, generateNodeId, TRACE_HEADER, TRACEPARENT_HEADER } from './correlation.js';
import { BROWSER_EVENTS } from './event-types.js';

export function patchXhr(): void {
  if (typeof XMLHttpRequest === 'undefined') return;

  const OriginalXHR = XMLHttpRequest;

  class ObservedXHR extends OriginalXHR {
    private _traceId = generateW3CTraceId();
    private _spanId = generateW3CSpanId();
    private _method = 'GET';
    private _url = '';
    private _nodeId = '';
    private _startedAt = 0;

    open(method: string, url: string | URL, ...rest: unknown[]): void {
      this._method = method.toUpperCase();
      this._url = typeof url === 'string' ? url : url.href;
      this._nodeId = generateNodeId('browser', `xhr:${this._traceId}`);
      // @ts-expect-error: variadic args
      super.open(method, url, ...rest);
    }

    setRequestHeader(name: string, value: string): void {
      super.setRequestHeader(name, value);
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      this._startedAt = Date.now();

      // Inject W3C traceparent AND legacy x-observer-trace-id for backward compat
      super.setRequestHeader(TRACEPARENT_HEADER, `00-${this._traceId}-${this._spanId}-01`);
      super.setRequestHeader(TRACE_HEADER, this._traceId);

      emit({
        type: BROWSER_EVENTS.XHR_STARTED,
        sourceNodeId: this._nodeId,
        occurredAt: this._startedAt,
        correlationId: this._traceId,
        payload: {
          method: this._method,
          url: this._url,
          hasBody: body != null,
        },
      });

      this.addEventListener('load', () => {
        emit({
          type: BROWSER_EVENTS.XHR_COMPLETED,
          sourceNodeId: this._nodeId,
          occurredAt: Date.now(),
          correlationId: this._traceId,
          severity: this.status >= 400 ? 'WARN' : 'INFO',
          payload: {
            method: this._method,
            url: this._url,
            status: this.status,
            statusText: this.statusText,
            duration: Date.now() - this._startedAt,
            contentType: this.getResponseHeader('content-type') ?? null,
          },
        });
      });

      this.addEventListener('error', () => {
        emit({
          type: BROWSER_EVENTS.XHR_FAILED,
          sourceNodeId: this._nodeId,
          occurredAt: Date.now(),
          correlationId: this._traceId,
          severity: 'ERROR',
          payload: {
            method: this._method,
            url: this._url,
            duration: Date.now() - this._startedAt,
          },
        });
      });

      super.send(body);
    }
  }

  // @ts-expect-error: replace global XHR
  window.XMLHttpRequest = ObservedXHR;
}
