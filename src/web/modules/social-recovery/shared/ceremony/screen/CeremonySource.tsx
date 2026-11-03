/**
 * The source the ceremony screen reads its ceremony from, injected through
 * React context. The screen imports no SDK double. The tab as the route mounts
 * it supplies the wallet's own source, a resolver over the wallet's records
 * and the client, wherever no provider sits above it; a test or a manual run
 * mounts its own provider instead. `resolve` returns null where nothing waits
 * under the request id, and a refusal where the request's method has no
 * implementation, which reads not supported; one that throws reads
 * unavailable with retry, or cancelled where the holder cancelled first. A
 * source with no `resolve` runs nothing and reports not supported, since it
 * holds no implementation for any method.
 */
import React, { createContext, ReactNode, useContext, useMemo } from 'react'

import type { CeremonySource } from './types'

const CeremonySourceContext = createContext<CeremonySource | null>(null)

const NO_SOURCE: CeremonySource = Object.freeze({})

export const CeremonySourceProvider = ({
  source,
  children
}: {
  source: CeremonySource
  children: ReactNode
}) => {
  const value = useMemo(() => source, [source])
  return <CeremonySourceContext.Provider value={value}>{children}</CeremonySourceContext.Provider>
}

export const useCeremonySource = (): CeremonySource =>
  useContext(CeremonySourceContext) ?? NO_SOURCE

/** Whether a provider above supplies the source. */
export const useHasCeremonySource = (): boolean => useContext(CeremonySourceContext) !== null
