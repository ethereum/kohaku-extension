import { Signature, Transaction, TransactionLike } from 'ethers'

import ExternalSignerError from '@ambire-common/classes/ExternalSignerError'
import { EIP7702Auth } from '@ambire-common/consts/7702'
import { Hex } from '@ambire-common/interfaces/hex'
import {
  ExternalKey,
  KeystoreSignerInterface,
  TxnRequest
} from '@ambire-common/interfaces/keystore'
import { addHexPrefix } from '@ambire-common/utils/addHexPrefix'
import { getHdPathFromTemplate } from '@ambire-common/utils/hdPath'
import hexStringToUint8Array from '@ambire-common/utils/hexStringToUint8Array'
import shortenAddress from '@ambire-common/utils/shortenAddress'
import { stripHexPrefix } from '@ambire-common/utils/stripHexPrefix'
import LedgerController, {
  LedgerSignature
} from '@web/modules/hardware-wallet/controllers/LedgerController'

class LedgerSigner implements KeystoreSignerInterface {
  key: ExternalKey & { isExternallyStored: boolean }

  controller: LedgerController | null = null

  constructor(_key: ExternalKey) {
    this.key = { ..._key, isExternallyStored: true }
  }

  // TODO: the ExternalSignerController type is missing some properties from
  // type 'LedgerController', sync the types mismatch
  // @ts-ignore
  init(externalDeviceController?: LedgerController) {
    if (!externalDeviceController) {
      throw new ExternalSignerError('ledgerSigner: externalDeviceController not initialized', {
        sendCrashReport: true
      })
    }

    this.controller = externalDeviceController
  }

  #prepareForSigning = async () => {
    if (!this.controller) {
      throw new ExternalSignerError(
        'Something went wrong when preparing Ledger to sign. Please try again or contact support if the problem persists.',
        {
          sendCrashReport: true
        }
      )
    }

    const path = getHdPathFromTemplate(this.key.meta.hdPathTemplate, this.key.meta.index)
    await this.controller.unlock(path, this.key.addr)

    // After unlocking, SDK instance should always be present, double-check here
    if (!this.controller.walletSDK) {
      throw new ExternalSignerError(
        'Something went wrong when preparing Ledger to sign. Please try again or contact support if the problem persists.',
        {
          sendCrashReport: true
        }
      )
    }

    if (!this.controller.isUnlocked(path, this.key.addr)) {
      throw new ExternalSignerError(
        `The Ledger is unlocked, but with different seed or passphrase, because the address of the retrieved key is different than the key expected (${shortenAddress(
          this.key.addr,
          13
        )})`
      )
    }
  }

  #normalizeSignature(rawSignature: LedgerSignature): string {
    const strippedR = stripHexPrefix(rawSignature.r)
    const strippedS = stripHexPrefix(rawSignature.s)
    return addHexPrefix(`${strippedR}${strippedS}${rawSignature.v.toString(16)}`)
  }

  signRawTransaction: KeystoreSignerInterface['signRawTransaction'] = async (txnRequest) => {
    await this.#prepareForSigning()

    // In case `maxFeePerGas` is provided, treat as an EIP-1559 transaction,
    // since there's no other better way to distinguish between the two in here.
    const type = typeof txnRequest.maxFeePerGas === 'bigint' ? 2 : 0

    try {
      const unsignedTxn: TransactionLike = { ...txnRequest, type }
      const unsignedSerializedTxn = Transaction.from(unsignedTxn).unsignedSerialized
      const strippedTxn = stripHexPrefix(unsignedSerializedTxn)
      const transactionBytes = hexStringToUint8Array(strippedTxn)

      const path = getHdPathFromTemplate(this.key.meta.hdPathTemplate, this.key.meta.index)
      const res = await this.controller!.signTransaction(path, transactionBytes)

      const signature = Signature.from({
        r: res.r,
        s: res.s,
        v: Signature.getNormalizedV(res.v)
      })
      const signedSerializedTxn = Transaction.from({
        ...unsignedTxn,
        signature
      }).serialized

      return signedSerializedTxn
    } catch (e: any) {
      throw new ExternalSignerError(
        e?.message || 'ledgerSigner: singing failed for unknown reason',
        {
          // We don't want to send crash reports of expected errors. If the errors is
          // TypeError, RuntimeError, etc. - we want to send it.
          sendCrashReport: e instanceof ExternalSignerError ? e.sendCrashReport : true
        }
      )
    }
  }

  signTypedData: KeystoreSignerInterface['signTypedData'] = async (signTypedData) => {
    await this.#prepareForSigning()

    try {
      const path = getHdPathFromTemplate(this.key.meta.hdPathTemplate, this.key.meta.index)
      const signature = await this.controller!.signTypedData({
        path,
        signTypedData
      })

      return this.#normalizeSignature(signature)
    } catch (e: any) {
      throw new ExternalSignerError(
        e?.message ||
          'Signing the typed data message failed. Please try again or contact Ambire support if issue persists.',
        {
          // We don't want to send crash reports of expected errors. If the errors is
          // TypeError, RuntimeError, etc. - we want to send it.
          sendCrashReport: e instanceof ExternalSignerError ? e.sendCrashReport : true
        }
      )
    }
  }

  signMessage: KeystoreSignerInterface['signMessage'] = async (hex) => {
    if (!stripHexPrefix(hex)) {
      throw new ExternalSignerError(
        'Request for signing an empty message detected. Signing empty messages with Ambire is disallowed.'
      )
    }

    await this.#prepareForSigning()

    try {
      const path = getHdPathFromTemplate(this.key.meta.hdPathTemplate, this.key.meta.index)
      const signature = await this.controller!.signPersonalMessage(path, stripHexPrefix(hex))

      return this.#normalizeSignature(signature)
    } catch (e: any) {
      throw new ExternalSignerError(
        e?.message ||
          'Signing the message failed. Please try again or contact Ambire support if issue persists.',
        {
          // We don't want to send crash reports of expected errors. If the errors is
          // TypeError, RuntimeError, etc. - we want to send it.
          sendCrashReport: e instanceof ExternalSignerError ? e.sendCrashReport : true
        }
      )
    }
  }

  // eslint-disable-next-line class-methods-use-this
  sign7702(hex: string): { yParity: Hex; r: Hex; s: Hex } {
    throw new Error('not support', { cause: hex })
  }

  // eslint-disable-next-line class-methods-use-this
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  signTransactionTypeFour(txnRequest: TxnRequest, eip7702Auth: EIP7702Auth): Hex {
    throw new Error('not supported', { cause: txnRequest })
  }

  async signingCleanup() {
    await this.controller?.signingCleanup()
  }
}

export default LedgerSigner
