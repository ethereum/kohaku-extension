import { hexlify, Signature, Transaction, TransactionLike } from 'ethers'

import ExternalSignerError from '@ambire-common/classes/ExternalSignerError'
import { EIP7702Auth } from '@ambire-common/consts/7702'
import { Hex } from '@ambire-common/interfaces/hex'
import {
  ExternalKey,
  KeystoreSignerInterface,
  TxnRequest
} from '@ambire-common/interfaces/keystore'
import { addHexPrefix } from '@ambire-common/utils/addHexPrefix'
import { getHDPathIndices } from '@ambire-common/utils/hdPath'
import shortenAddress from '@ambire-common/utils/shortenAddress'
import wait from '@ambire-common/utils/wait'
import LatticeController, {
  GridPlusSDKConstants
} from '@web/modules/hardware-wallet/controllers/LatticeController'

class LatticeSigner implements KeystoreSignerInterface {
  key: ExternalKey

  controller: LatticeController | null = null

  constructor(_key: ExternalKey) {
    this.key = _key
  }

  // TODO: the ExternalSignerController type is missing some properties from
  // type 'LatticeController', sync the types mismatch
  // @ts-ignore
  init(externalSignerController?: LatticeController) {
    if (!externalSignerController) {
      throw new ExternalSignerError('latticeSigner: externalSignerController not initialized', {
        sendCrashReport: true
      })
    }

    this.controller = externalSignerController
  }

  #prepareForSigning = async () => {
    if (!this.controller)
      throw new ExternalSignerError(
        'Something went wrong when preparing Lattice1 to sign. Please try again or contact support if the problem persists.',
        {
          sendCrashReport: true
        }
      )

    if (!this.key)
      throw new ExternalSignerError(
        'Something went wrong when preparing Lattice1 to sign. Required information about the signing key was found missing. Please try again or contact Ambire support.',
        {
          sendCrashReport: true
        }
      )

    // Wait a little bit before opening the Lattice Connector on purpose, so
    // that user sees feedback (the "sending signing request" modal) that
    // something is about to happen
    await wait(1000)
    await this.controller.unlock(this.key.meta.hdPathTemplate, this.key.addr)

    if (!this.controller.walletSDK)
      throw new ExternalSignerError(
        'Something went wrong when preparing Lattice1 to sign. Please try again or contact support if the problem persists.',
        {
          sendCrashReport: true
        }
      )
  }

  /**
   * Checks if the key (address) the Lattice1 signed with is the same as the key
   * (address) address we expect. They could differ if the Lattice1 active wallet
   * is different than the one we expect.
   */
  #validateSigningKey = (signedWithAddr: string | null) => {
    // Missing address means the validation can't be done, skip it (should never happen)
    if (!signedWithAddr) return

    if (signedWithAddr !== this.key.addr) {
      throw new ExternalSignerError(
        `The key you signed with (${shortenAddress(
          signedWithAddr,
          13
        )}) is different than the key we expected (${shortenAddress(
          this.key.addr,
          13
        )}). You likely have different active wallet on your Lattice1 device.`
      )
    }
  }

  #validateKeyExistsInTheCurrentWallet = async () => {
    const foundIdx = await this.controller!._keyIdxInCurrentWallet(this.key)
    if (foundIdx === null) {
      throw new ExternalSignerError(
        `The key you signed with is different than the key we expected (${shortenAddress(
          this.key.addr,
          13
        )}). You likely have different active wallet on your Lattice1 device.`
      )
    }
  }

  signRawTransaction: KeystoreSignerInterface['signRawTransaction'] = async (txnRequest) => {
    await this.#prepareForSigning()

    // EIP1559 and EIP2930 support was added to Lattice in firmware v0.11.0,
    // "general signing" was introduced in v0.14.0. In order to avoid supporting
    // legacy firmware, throw an error and prompt user to update.
    const fwVersion = this.controller!.walletSDK!.getFwVersion()
    if (fwVersion?.major === 0 && fwVersion?.minor <= 14) {
      throw new ExternalSignerError(
        'Unable to sign the transaction because your Lattice1 device firmware is outdated. Please update to the latest firmware and try again.'
      )
    }

    try {
      const signerPath = getHDPathIndices(this.key.meta.hdPathTemplate, this.key.meta.index)
      // In case `maxFeePerGas` is provided, treat as an EIP-1559 transaction,
      // since there's no other better way to distinguish between the two in here.
      const type = typeof txnRequest.maxFeePerGas === 'bigint' ? 2 : 0
      const unsignedTxn: TransactionLike = { ...txnRequest, type }

      const unsignedSerializedTxn = Transaction.from(unsignedTxn).unsignedSerialized

      const res = await this.controller!.walletSDK!.sign({
        // Prior to general signing, request data was sent to the device in
        // preformatted ways and was used to build the transaction in firmware.
        // GridPlus are phasing out this mechanism, for signing raw transactions
        // flip to using the "general signing" mechanism, instead of the legacy
        // one that was getting triggered by passing `currency: 'ETH'` flag.
        data: {
          signerPath,
          payload: unsignedSerializedTxn,
          curveType: GridPlusSDKConstants.SIGNING.CURVES.SECP256K1,
          hashType: GridPlusSDKConstants.SIGNING.HASHES.KECCAK256,
          encodingType: GridPlusSDKConstants.SIGNING.ENCODINGS.EVM
        }
      })

      // Ensure we got a signature back
      if (!res?.sig || !res.sig.r || !res.sig.s || !res.sig.v) {
        throw new ExternalSignerError('latticeSigner: no signature returned', {
          sendCrashReport: true
        })
      }

      // GridPlus SDK's type for the signature is any, either because of bad
      // types, either because of bad typescript import/export configuration.
      type MissingSignatureType = {
        v: Uint8Array
        r: Uint8Array
        s: Uint8Array
      }
      const { r, s, v } = res.sig as MissingSignatureType

      const signature = Signature.from({
        r: hexlify(r),
        s: hexlify(s),
        v: Signature.getNormalizedV(hexlify(v))
      })
      const signedTxn = Transaction.from({
        ...unsignedTxn,
        signature
      })

      await this.#validateSigningKey(signedTxn.from)

      return signedTxn.serialized
    } catch (error: any) {
      const errorMessage = error?.message || error?.err

      throw new ExternalSignerError(
        // An `error.err` message might come from the Lattice .sign() failure
        errorMessage || 'latticeSigner: singing failed for unknown reason',
        {
          sendCrashReport: !errorMessage
        }
      )
    }
  }

  signTypedData: KeystoreSignerInterface['signTypedData'] = async ({
    domain,
    types,
    message,
    primaryType
  }) => {
    if (!types.EIP712Domain) {
      throw new ExternalSignerError(
        'Unable to sign the message. Lattice1 supports signing EIP-712 type messages only.'
      )
    }

    return this._signMsgRequest({ domain, types, primaryType, message }, 'eip712')
  }

  signMessage: KeystoreSignerInterface['signMessage'] = async (hash) => {
    return this._signMsgRequest(hash, 'signPersonal')
  }

  async _signMsgRequest(payload: any, protocol: 'signPersonal' | 'eip712') {
    await this.#prepareForSigning()

    const req = {
      currency: 'ETH_MSG' as const,
      data: {
        protocol,
        payload,
        signerPath: getHDPathIndices(this.key.meta.hdPathTemplate, this.key.meta.index),
        curveType: GridPlusSDKConstants.SIGNING.CURVES.SECP256K1,
        hashType: GridPlusSDKConstants.SIGNING.HASHES.KECCAK256
      }
    }

    const res = await this.controller!.walletSDK!.sign(req)
    if (!res.sig)
      throw new ExternalSignerError(
        'Required signature data was found missing. Please try again later or contact Ambire support.',
        {
          sendCrashReport: true
        }
      )

    // TODO: Figure out how to retrieve the signing key address from the
    // signature and then use the #validateSigningKey instead.
    await this.#validateKeyExistsInTheCurrentWallet()

    return addHexPrefix(`${res.sig.r}${res.sig.s}${res.sig.v.toString('hex')}`)
  }

  // eslint-disable-next-line class-methods-use-this
  sign7702(hex: string): { yParity: Hex; r: Hex; s: Hex } {
    throw new Error('not supported', { cause: hex })
  }

  // eslint-disable-next-line class-methods-use-this
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  signTransactionTypeFour(txnRequest: TxnRequest, eip7702Auth: EIP7702Auth): Hex {
    throw new Error('not supported', { cause: txnRequest })
  }
}

export default LatticeSigner
