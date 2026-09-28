/**
 * The source the ceremony screen reads its ceremony from, injected through
 * React context. The screen imports no SDK double. A provider mounted above
 * the route is to supply a resolver over the client and the wallet's records;
 * that wiring comes with a later task, and no route mounts a provider yet. A
 * test provides its own. `resolve` returns null where nothing waits under the
 * request id; one that throws reads unavailable with retry, or cancelled where
 * the holder cancelled first. With no provider the screen runs nothing and
 * reports not supported, since this build then holds no implementation for
 * any method.
 */
import React, { createContext, ReactNode, useContext, useMemo } from 'react'

import type { CeremonySource } from './types'

const CeremonySourceContext = createContext<CeremonySource>({})

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

export const useCeremonySource = (): CeremonySource => useContext(CeremonySourceContext)
