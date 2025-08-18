import { HDNodeWallet } from 'ethers'

import ExternalSignerError from '@ambire-common/classes/ExternalSignerError'
import { HD_PATH_TEMPLATE_TYPE } from '@ambire-common/consts/derivation'
import { KeyIterator as KeyIteratorInterface } from '@ambire-common/interfaces/keyIterator'
import { getMessageFromTrezorErrorCode } from '@ambire-common/libs/trezor/trezor'
import { getHdPathFromTemplate, getParentHdPathFromTemplate } from '@ambire-common/utils/hdPath'
import { TrezorConnect } from '@web/modules/hardware-wallet/controllers/TrezorController'

interface KeyIteratorProps {
  walletSDK: TrezorConnect
}

/**
 * Serves for retrieving a range of addresses/keys from a Trezor hardware wallet
 */
class TrezorKeyIterator implements KeyIteratorInterface {
  type = 'trezor' as 'trezor'

  subType = 'hw' as 'hw'

  #walletSDK: KeyIteratorProps['walletSDK']

  // Cache the extended public key that would allow calculating all addresses
  // in the range, to avoid unnecessary requests to the Trezor device.
  #xpub?: string

  constructor({ walletSDK }: KeyIteratorProps) {
    if (!walletSDK) throw new Error('trezorKeyIterator: missing walletSDK prop')

    this.#walletSDK = walletSDK
  }

  #deriveAddressFromXpub(index: number): string {
    if (!this.#xpub)
      throw new ExternalSignerError(
        'Could not generate an Ethereum address because the extended public key is missing.'
      )

    try {
      const hdNode = HDNodeWallet.fromExtendedKey(this.#xpub)
      const childNode = hdNode.deriveChild(index)

      return childNode.address
    } catch (error: any) {
      throw new ExternalSignerError(
        `Could not generate Ethereum address from the extended public key received from your Trezor device. Technical details: <${error?.message}>.`,
        {
          sendCrashReport: true
        }
      )
    }
  }

  async retrieve(
    fromToArr: { from: number; to: number }[],
    hdPathTemplate?: HD_PATH_TEMPLATE_TYPE
  ) {
    if (!this.#walletSDK) throw new Error('trezorKeyIterator: walletSDK not initialized')
    if (!hdPathTemplate) throw new Error('trezorKeyIterator: missing hdPathTemplate')

    const addrBundleToBeRequested: { path: string; index: number }[] = []
    fromToArr.forEach(({ from, to }) => {
      if ((!from && from !== 0) || (!to && to !== 0))
        throw new Error('trezorKeyIterator: invalid or missing arguments')

      for (let i = from; i <= to; i++) {
        const path = getHdPathFromTemplate(hdPathTemplate, i)
        addrBundleToBeRequested.push({ path, index: i })
      }
    })

    if (!this.#xpub) {
      try {
        const res = await this.#walletSDK.getPublicKey({
          coin: 'ETH',
          path: getParentHdPathFromTemplate(hdPathTemplate),
          showOnTrezor: false
        })

        if (!res.success)
          throw new ExternalSignerError(
            getMessageFromTrezorErrorCode(res.payload.code, res.payload.error)
          )

        this.#xpub = res.payload.xpub
      } catch (error: any) {
        if (error instanceof ExternalSignerError) throw error

        throw new ExternalSignerError(
          `Could not receive the extended public key from your Trezor device. Technical details: <${error?.message}>.`,
          { sendCrashReport: true }
        )
      }
    }

    return addrBundleToBeRequested.map(({ index }) => this.#deriveAddressFromXpub(index))
  }
}

export default TrezorKeyIterator
