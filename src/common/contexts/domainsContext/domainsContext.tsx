import React, { createContext, useEffect, useMemo, useState } from 'react'

import { networks } from '@ambire-common/consts/networks'
import { DomainsController } from '@ambire-common/controllers/domains/domains'
import { getRpcProvider } from '@ambire-common/services/provider'

const DomainsContext = createContext<{
  state: DomainsController
  domainsCtrl: DomainsController
}>({
  state: {} as DomainsController,
  domainsCtrl: {} as DomainsController
})

const providers = networks.reduce(
  (acc, network) => ({
    ...acc,
    [network.chainId.toString()]: getRpcProvider(network)
  }),
  {}
)

const domainsCtrl = new DomainsController(providers)

const DomainsContextProvider: React.FC<any> = ({ children }) => {
  const [state, setState] = useState<DomainsController>(domainsCtrl)

  useEffect(() => {
    if (!domainsCtrl) return

    domainsCtrl.onUpdate(() => {
      setState(domainsCtrl.toJSON())
    })
  }, [])

  const value = useMemo(
    () => ({
      state,
      domainsCtrl
    }),
    [state]
  )

  return <DomainsContext.Provider value={value}>{children}</DomainsContext.Provider>
}

export { DomainsContextProvider, DomainsContext }
