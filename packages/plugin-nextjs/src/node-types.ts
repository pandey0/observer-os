export const NEXTJS_EVENTS = {
  APP_REQUEST_STARTED:     'observer.nextjs/app.request.started',
  APP_REQUEST_COMPLETED:   'observer.nextjs/app.request.completed',
  APP_REQUEST_FAILED:      'observer.nextjs/app.request.failed',
  PAGES_REQUEST_STARTED:   'observer.nextjs/pages.request.started',
  PAGES_REQUEST_COMPLETED: 'observer.nextjs/pages.request.completed',
  PAGES_REQUEST_FAILED:    'observer.nextjs/pages.request.failed',
  API_REQUEST_STARTED:     'observer.nextjs/api.request.started',
  API_REQUEST_COMPLETED:   'observer.nextjs/api.request.completed',
  API_REQUEST_FAILED:      'observer.nextjs/api.request.failed',
  RSC_RENDER_STARTED:      'observer.nextjs/rsc.render.started',
  RSC_RENDER_COMPLETED:    'observer.nextjs/rsc.render.completed',
  GSSP_STARTED:            'observer.nextjs/gssp.started',
  GSSP_COMPLETED:          'observer.nextjs/gssp.completed',
  GSP_STARTED:             'observer.nextjs/gsp.started',
  GSP_COMPLETED:           'observer.nextjs/gsp.completed',
  MIDDLEWARE_INVOKED:      'observer.nextjs/middleware.invoked',
  MIDDLEWARE_COMPLETED:    'observer.nextjs/middleware.completed',
  FETCH_STARTED:           'observer.nextjs/fetch.started',
  FETCH_COMPLETED:         'observer.nextjs/fetch.completed',
  FETCH_FAILED:            'observer.nextjs/fetch.failed',
} as const;

export type NextjsEventType = typeof NEXTJS_EVENTS[keyof typeof NEXTJS_EVENTS];
