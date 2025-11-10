/* eslint-disable no-param-reassign */
import { Network } from '@ambire-common/interfaces/network'

export const DISABLED_BUNDLER_DEFAULT = 'Using Pimlico'

const handleErrors = (error: any) => {
  if (typeof error === 'boolean') return error
  if (typeof error?.message === 'string') return error?.message
  if (!error) return false
}

const getAreDefaultsChanged = (values: any, selectedNetwork?: Network) => {
  if (!selectedNetwork) return false
  delete values.rpcUrl
  // TODO: remove these 2
  delete values.platformId
  delete values.nativeAssetId

  return Object.keys(values).some((key) => {
    if (key === 'chainId') {
      return values[key] !== Number(selectedNetwork[key])
    }
    if (key === 'rpcUrls') {
      return (
        values[key].some((u: string) => !(selectedNetwork.rpcUrls || []).includes(u)) ||
        !values[key].length
      )
    }

    if (key === 'useHelios') {
      return values[key] !== (selectedNetwork[key as keyof Network] || false)
    }
    return key in selectedNetwork && values[key] !== selectedNetwork[key as keyof Network]
  })
}

export { getAreDefaultsChanged, handleErrors }
