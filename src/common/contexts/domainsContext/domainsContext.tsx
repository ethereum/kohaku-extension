import React, { createContext, useEffect, useMemo, useRef, useState } from 'react'

import { networks } from '@ambire-common/consts/networks'
import { DomainsController } from '@ambire-common/controllers/domains/domains'
import { getRpcProvider } from '@ambire-common/services/provider'
import { isExtension } from '@web/constants/browserapi'
import { getRpcProviderForUI } from '@web/services/provider'
import useBackgroundService from '@web/hooks/useBackgroundService'

const DomainsContext = createContext<{
  state: DomainsController
  domainsCtrl: DomainsController | null
}>({
  state: {} as DomainsController,
  domainsCtrl: null
})

const DomainsContextProvider: React.FC<any> = ({ children }) => {
  const { dispatch } = isExtension ? useBackgroundService() : { dispatch: null }
  const domainsCtrlRef = useRef<DomainsController | null>(null)
  const [state, setState] = useState<DomainsController>({} as DomainsController)

  useEffect(() => {
    // Create providers - use proxy provider in extension, regular provider otherwise
    const providers = networks.reduce(
      (acc, network) => ({
        ...acc,
        [network.chainId.toString()]:
          isExtension && dispatch ? getRpcProviderForUI(network, dispatch) : getRpcProvider(network)
      }),
      {}
    )

    const domainsCtrl = new DomainsController(providers)
    domainsCtrlRef.current = domainsCtrl

    domainsCtrl.onUpdate(() => {
      setState(domainsCtrl.toJSON())
    })

    return () => {
      Object.values(providers).forEach((provider: any) => {
        if (provider.destroy) provider.destroy()
      })
    }
  }, [dispatch])

  const value = useMemo(
    () => ({
      state,
      domainsCtrl: domainsCtrlRef.current
    }),
    [state]
  )

  return <DomainsContext.Provider value={value}>{children}</DomainsContext.Provider>
}

export { DomainsContextProvider, DomainsContext }
