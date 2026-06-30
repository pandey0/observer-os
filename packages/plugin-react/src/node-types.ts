export const REACT_NODE_TYPES = {
  Component:    { type: 'observer.react/Component',    domain: 'react' },
  ErrorBoundary: { type: 'observer.react/ErrorBoundary', domain: 'react' },
  Suspense:     { type: 'observer.react/Suspense',     domain: 'react' },
} as const;

export const REACT_EVENTS = {
  COMPONENT_MOUNTED:   'observer.react/component.mounted',
  COMPONENT_UPDATED:   'observer.react/component.updated',
  COMPONENT_UNMOUNTED: 'observer.react/component.unmounted',
  COMPONENT_ERRORED:   'observer.react/component.errored',
  SUSPENSE_PENDING:    'observer.react/suspense.pending',
  SUSPENSE_RESOLVED:   'observer.react/suspense.resolved',
} as const;
