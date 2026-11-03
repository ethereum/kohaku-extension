/**
 * The ceremony tab as the route mounts it. Where a provider above supplies
 * the source, the screen reads that one. Otherwise the tab mounts the
 * wallet's own: a resolver that reads the request stored under the id in the
 * extension's local storage and builds the client for its account and chain
 * over the extension's own provider.
 */
import React, { ReactNode, useLayoutEffect, useMemo, useRef } from 'react'

import useNetworksControllerState from '@web/hooks/useNetworksControllerState'
import {
  createCeremonyResolver,
  extensionClientFor
} from '@web/modules/social-recovery/shared/client'
import {
  createWalletRecords,
  extensionRecordStorage
} from '@web/modules/social-recovery/shared/records'

import CeremonyScreen from './CeremonyScreen'
import { CeremonySourceProvider, useHasCeremonySource } from './CeremonySource'
import type { CeremonySource } from './types'

const WalletCeremonySource = ({ children }: { children: ReactNode }) => {
  const { networks } = useNetworksControllerState()
  // The resolver reads the networks when it runs, so an update of the networks
  // keeps the source, and the ceremony it runs, as they are.
  const networksRef = useRef(networks)
  useLayoutEffect(() => {
    networksRef.current = networks
  }, [networks])
  const source = useMemo<CeremonySource>(
    () => ({
      resolve: createCeremonyResolver({
        records: createWalletRecords({ storage: extensionRecordStorage }),
        clientFor: extensionClientFor(() => networksRef.current)
      })
    }),
    []
  )
  return <CeremonySourceProvider source={source}>{children}</CeremonySourceProvider>
}

const CeremonyTab = () =>
  useHasCeremonySource() ? (
    <CeremonyScreen />
  ) : (
    <WalletCeremonySource>
      <CeremonyScreen />
    </WalletCeremonySource>
  )

export default CeremonyTab
