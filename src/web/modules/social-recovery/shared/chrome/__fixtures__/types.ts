import type { unstable_HistoryRouter as HistoryRouter } from 'react-router-dom'

/** The tab history the router reads. */
export type RouterHistory = Parameters<typeof HistoryRouter>[0]['history']

/** Where a push or a replace on the tab history goes. */
export type HistoryTarget = Parameters<RouterHistory['push']>[0]

/** The listener the router hands the tab history. */
export type HistoryListener = Parameters<RouterHistory['listen']>[0]

/**
 * A tab history the test can watch: how often the page pushed or replaced an
 * entry, and where in the list of entries it stands.
 */
export type WatchedHistory = {
  history: RouterHistory & { readonly index: number }
  pushes: jest.SpyInstance
  replaces: jest.SpyInstance
}

/** A promise a test settles by hand. */
export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}
