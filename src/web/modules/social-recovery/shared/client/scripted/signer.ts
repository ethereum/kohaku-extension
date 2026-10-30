/**
 * The scripted signer: the extension's signer facade over one local key,
 * signing at once with no request queue and no action window. It serves the
 * unit tests and the build with no deployment alone; a holder-facing build
 * signs through `createSignerFacade`.
 */
import type { Hex } from '@kohaku-eth/social-recovery'
import type { LocalAccount } from 'viem'
import { isAddressEqual } from 'viem'

import type { KeyHandle, SignerFacade, TypedDataToSign } from '../types'

const refuseOther = (signer: LocalAccount, key: KeyHandle): void => {
  if (!isAddressEqual(signer.address, key.addr)) {
    throw new Error(`The scripted signer holds ${signer.address}, not ${key.addr}.`)
  }
}

export const createScriptedSigner = (signer: LocalAccount): SignerFacade => ({
  async signTypedData(key: KeyHandle, typedData: TypedDataToSign): Promise<Hex> {
    refuseOther(signer, key)
    // viem derives the domain type from the domain itself.
    const types = Object.fromEntries(
      Object.entries(typedData.types).filter(([name]) => name !== 'EIP712Domain')
    )
    return signer.signTypedData({
      domain: typedData.domain as Parameters<LocalAccount['signTypedData']>[0]['domain'],
      types,
      primaryType: typedData.primaryType,
      message: typedData.message
    })
  },

  async signBytes(key: KeyHandle, bytes: Hex): Promise<Hex> {
    refuseOther(signer, key)
    return signer.signMessage({ message: { raw: bytes } })
  }
})
