import { Observable, Subscription } from 'rxjs'

import ExternalSignerError from '@ambire-common/classes/ExternalSignerError'
import { ExternalSignerController } from '@ambire-common/interfaces/keystore'
import { TypedMessage } from '@ambire-common/interfaces/userRequest'
import { normalizeLedgerMessage } from '@ambire-common/libs/ledger/ledger'
import { getHdPathFromTemplate, getHdPathWithoutRoot } from '@ambire-common/utils/hdPath'
import hexStringToUint8Array from '@ambire-common/utils/hexStringToUint8Array'
import { ContextModuleBuilder } from '@ledgerhq/context-module'
import {
  DeviceManagementKitBuilder,
  DeviceModelId as LedgerDeviceModels,
  DiscoveredDevice,
  LEDGER_VENDOR_ID,
  UserInteractionRequired
} from '@ledgerhq/device-management-kit'
import {
  Signature as LedgerSignature,
  SignerEthBuilder,
  TypedDataDomain
} from '@ledgerhq/device-signer-kit-ethereum'
import { webHidTransportFactory } from '@ledgerhq/device-transport-kit-web-hid'
import { isVivaldi } from '@web/constants/browserapi'

export { LedgerDeviceModels, type LedgerSignature }

const TIMEOUT_FOR_RETRIEVING_FROM_LEDGER = 5000

class LedgerController implements ExternalSignerController {
  unlockedPath: string = ''

  unlockedPathKeyAddr: string = ''

  isWebHID: boolean

  signerEth: ReturnType<SignerEthBuilder['build']> | null = null

  walletSDK: ReturnType<DeviceManagementKitBuilder['build']> | null = null

  type = 'ledger'

  deviceModel: LedgerDeviceModels | 'unknown' = 'unknown'

  deviceId = ''

  static vendorId = LEDGER_VENDOR_ID

  #rejectSigningSubscription: (() => void) | null = null

  constructor() {
    // TODO: Bluetooth support?
    this.isWebHID = true

    // When the `cleanUpListener` method gets passed to the navigator.hid listeners
    // the `this` context gets lost, so we need to bind it here. The `this` context
    // in the `cleanUp` method should be the `LedgerController` instance.
    this.cleanUpListener = this.cleanUpListener.bind(this)
  }

  isUnlocked(path?: string, expectedKeyOnThisPath?: string) {
    // If no path or expected key is provided, just check if there is any
    // unlocked path, that's a valid case when retrieving accounts for import.
    if (!path || !expectedKeyOnThisPath) {
      return !!(this.unlockedPath && this.unlockedPathKeyAddr)
    }

    // Make sure it's unlocked with the right path and with the right key,
    // otherwise - treat as not unlocked.
    return this.unlockedPathKeyAddr === expectedKeyOnThisPath && this.unlockedPath === path
  }

  /**
   * Checks if WebHID transport is supported by the browser.
   * Note: This API is not available in service workers in manifest v3.
   */
  static isSupported = () =>
    typeof navigator !== 'undefined' && navigator !== null && 'hid' in navigator

  /**
   * Checks if at least one Ledger device is connected.
   */
  static isConnected = async () => {
    if (!('hid' in navigator)) return false

    const devices = await navigator.hid.getDevices()
    const hasFoundLedgerDevice =
      devices.filter((device) => device.vendorId === LedgerController.vendorId).length > 0
    if (hasFoundLedgerDevice) return true

    // TODO: Temporarily bypass the device detection for Vivaldi, because although
    // the device is connected, the getDevices() method returns an empty array.
    // Workarounds I tried - find the device via DMK didn't click. So to be able
    // to use Ledger device with Vivaldi, we just assume it's connected.
    // IMPORTANT: This is fixed in https://vivaldi.com/blog/desktop/customizable-tab-bar-vivaldi-browser-snapshot-3704-3/
    // so once this version is released, we should remove this check.
    return isVivaldi()
  }

  /**
   * Grant permission to the extension service worker to access an HID device.
   * Should be called only from the foreground and it requires a user gesture
   * to open the device selection prompt (click on a button, etc.).
   */
  static grantDevicePermissionIfNeeded = async () => {
    const dmk = new DeviceManagementKitBuilder()
      // .addLogger(new ConsoleLogger()) // for debugging only
      .addTransport(webHidTransportFactory)
      .build()

    return new Promise((resolve, reject) => {
      // Start discovering - this will scan for any connected devices
      let subscription: Subscription // so it is always defined inside the subscribe callback
      // eslint-disable-next-line prefer-const
      subscription = dmk.startDiscovering({}).subscribe({
        next: async (device) => {
          subscription.unsubscribe()
          dmk.close()
          resolve(device)
        },
        error: (error) => {
          subscription.unsubscribe()
          reject(new ExternalSignerError(normalizeLedgerMessage(error?.message)))
        }
      })
    })
  }

  /**
   * This function is designed to handle the scenario where Ledger device loses
   * connectivity during an operation. Without this method, if the Ledger device
   * disconnects, the observable returned by the Ledger SDK throws an error,
   * but with an awkward delay.
   */
  withDisconnectProtection = async <T>(operation: () => Promise<T>): Promise<T> => {
    let listenerCbRef: (...args: Array<any>) => any = () => {}
    const disconnectHandler =
      (reject: (reason?: any) => void) =>
      async ({ device }: { device: HIDDevice }) => {
        if (LedgerController.vendorId === device.vendorId) {
          await this.cleanUp() // the communication with the initiated walletSDK drops
          reject(new ExternalSignerError('Ledger device got disconnected.'))
        }
      }

    try {
      // Race the operation against a new Promise that rejects if a 'disconnect'
      // event is emitted from the Ledger device. If the device disconnects
      // before the operation completes, the new Promise rejects and the method
      // returns, preventing the SDK from hanging. If the operation completes
      // before the device disconnects, the result of the operation is returned.
      const result = await Promise.race<T>([
        operation(),
        new Promise((_, reject) => {
          listenerCbRef = disconnectHandler(reject)
          navigator.hid.addEventListener('disconnect', listenerCbRef)
        })
      ])

      return result
    } finally {
      // In either case, the 'disconnect' event listener should be removed
      // after the operation to clean up resources.
      if (listenerCbRef) navigator.hid.removeEventListener('disconnect', listenerCbRef)
    }
  }

  /**
   * Handles the scenario where Ledger device hangs indefinitely during an
   * operation. Happens in some cases when the Ledger device gets connected to
   * Ambire, then another app is accessing the Ledger device and then user comes
   * back to Ambire (without unplug-plugging the Ledger).
   */
  static withTimeoutProtection = async <T>(operation: () => Promise<T>): Promise<T> => {
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const message =
          'Could not connect to your Ledger device for an extended period. Please close any other apps that may be accessing your Ledger device (including wallet apps on your computer and web apps). Ensure your Ledger is responsive. Unplug and plug it again.'
        reject(new ExternalSignerError(message))
      }, TIMEOUT_FOR_RETRIEVING_FROM_LEDGER)
    })

    return Promise.race([operation(), timeout])
  }

  /**
   * The Ledger device requires a new SDK instance (session) every time the
   * device is connected (after being disconnected). This method checks if there
   * is an existing SDK instance and creates a new one if needed.
   */
  async #initSDKSessionIfNeeded() {
    const isConnected = await LedgerController.isConnected()
    if (!isConnected)
      throw new ExternalSignerError("Ledger is not connected. Please make sure it's plugged in.")

    if (this.walletSDK) return

    try {
      this.walletSDK = new DeviceManagementKitBuilder()
        // .addLogger(new ConsoleLogger()) // for debugging only
        .addTransport(webHidTransportFactory)
        .build()

      const device = await this.#findDevice()
      if (!device) throw new Error('No Ledger device detected.')
      if (!this.walletSDK) throw new Error('Connection to Ledger device lost.')

      // Get device information
      const sessionId = await this.walletSDK.connect({ device })
      const connectedDevice = this.walletSDK.getConnectedDevice({ sessionId })
      this.deviceModel = connectedDevice.modelId
      this.deviceId = connectedDevice.id

      // Create the signer using the dynamically imported constructor
      const contextModule = new ContextModuleBuilder({ originToken: 'ambire' }).build()
      this.signerEth = new SignerEthBuilder({ dmk: this.walletSDK, sessionId })
        .withContextModule(contextModule)
        .build()

      // To clean up no matter if the device is in the middle of an operation or not
      navigator.hid.addEventListener('disconnect', this.cleanUpListener)
    } catch (e: any) {
      throw new ExternalSignerError(normalizeLedgerMessage(e?.message))
    }
  }

  #findDevice = () =>
    new Promise<DiscoveredDevice>((resolve, reject) => {
      let subscription: Subscription // so it is always defined inside the subscribe callback
      let isCancelled = false
      // eslint-disable-next-line prefer-const
      subscription = this.walletSDK!.listenToAvailableDevices({}).subscribe({
        next: (devices) => {
          if (isCancelled) return
          if (devices && devices.length) {
            subscription.unsubscribe()
            // TODO: Multiple devices found?
            resolve(devices[0])
          }
        },
        error: (error) => {
          if (isCancelled) return
          subscription.unsubscribe()
          reject(new Error(error?.message))
        }
      })

      this.#rejectSigningSubscription = () => {
        isCancelled = true
        subscription.unsubscribe()
        reject(new ExternalSignerError('Operation cancelled by user'))
      }
    })

  /**
   * Helper method to handle common Ledger observable subscription patterns
   */
  #handleLedgerSubscription<T>(
    observable: Observable<any>,
    options: {
      onCompleted: (output: any) => T
      errorMessage: string
      isSign?: boolean
    }
  ): Promise<T> {
    const { onCompleted, errorMessage, isSign } = options

    const subscriptionPromise = new Promise<T>((resolve, reject) => {
      let subscription: Subscription // so it is always defined inside the subscribe callback
      let isCancelled = false

      // eslint-disable-next-line prefer-const
      subscription = observable.subscribe({
        next: (response: any) => {
          if (isCancelled) return
          // TODO: If we communicate this to the user in the UI better, we can
          // wait for the user to do all required interactions instead of rejecting.
          const missingRequiredUserInteraction =
            response.status === 'pending' &&
            [UserInteractionRequired.UnlockDevice, UserInteractionRequired.ConfirmOpenApp].includes(
              response.intermediateValue.requiredUserInteraction
            )

          if (missingRequiredUserInteraction) {
            subscription.unsubscribe()
            reject(
              new ExternalSignerError(
                normalizeLedgerMessage(response.intermediateValue.requiredUserInteraction)
              )
            )
          }

          if (response.status === 'error') {
            subscription.unsubscribe()
            // @ts-ignore Ledger types not being resolved correctly in the SDK
            const deviceMessage = response.error?.message || 'no response from device'
            // @ts-ignore Ledger types not being resolved correctly in the SDK
            const deviceErrorCode = response.error?.errorCode
            let message = `<${deviceMessage}>`
            message = deviceErrorCode ? `${message}, error code: <${deviceErrorCode}>` : message
            return reject(new ExternalSignerError(normalizeLedgerMessage(message)))
          }

          if (response.status !== 'completed') return

          subscription.unsubscribe()
          if (response?.output) {
            resolve(onCompleted(response.output))
          } else {
            reject(new ExternalSignerError(normalizeLedgerMessage(errorMessage)))
          }
        },
        error: (error: any) => {
          subscription.unsubscribe()
          reject(new ExternalSignerError(normalizeLedgerMessage(error?.message)))
        }
      })

      if (isSign) {
        this.#rejectSigningSubscription = () => {
          isCancelled = true
          subscription.unsubscribe()
          reject(new ExternalSignerError('Operation cancelled by user'))
        }
      }
    })

    return this.withDisconnectProtection(() => subscriptionPromise)
  }

  async unlock(
    path: ReturnType<typeof getHdPathFromTemplate>,
    expectedKeyOnThisPath?: string
  ): Promise<'ALREADY_UNLOCKED' | 'JUST_UNLOCKED'> {
    await this.#initSDKSessionIfNeeded()

    if (this.isUnlocked(path, expectedKeyOnThisPath)) return 'ALREADY_UNLOCKED'

    if (!this.isWebHID)
      throw new ExternalSignerError(
        'Ledger only supports USB connection between Ambire and your device. Please connect your device via USB.'
      )

    if (!this.walletSDK || !this.signerEth) throw new ExternalSignerError(normalizeLedgerMessage()) // no message, indicating no connection

    const address = await this.#handleLedgerSubscription(
      this.signerEth!.getAddress(getHdPathWithoutRoot(path), {
        checkOnDevice: false,
        returnChainCode: false
      }).observable,
      {
        onCompleted: (output) => output.address,
        errorMessage: 'Failed to get address from Ledger device'
      }
    )

    // Save unlocked state
    this.unlockedPath = path
    this.unlockedPathKeyAddr = address

    return 'JUST_UNLOCKED' as const
  }

  retrieveAddresses = async (paths: string[]) => {
    await this.#initSDKSessionIfNeeded() // could happen if user retries

    if (!this.walletSDK || !this.signerEth) {
      throw new ExternalSignerError(normalizeLedgerMessage())
    }

    const keys: string[] = []
    let latestGetAddressError: ExternalSignerError | undefined

    for (let i = 0; i < paths.length; i++) {
      try {
        // Purposely await in loop to avoid sending multiple requests at once.
        // Send them 1 by 1, the Ledger device can't handle them in parallel,
        // it throws a "device busy" error.
        // eslint-disable-next-line no-await-in-loop
        const key = await this.#handleLedgerSubscription(
          this.signerEth!.getAddress(getHdPathWithoutRoot(paths[i]), {
            checkOnDevice: false,
            returnChainCode: false
          }).observable,
          {
            onCompleted: (output) => output.address,
            errorMessage: 'Failed to get address from Ledger device'
          }
        )

        keys.push(key)
      } catch (e: any) {
        latestGetAddressError = e
        break
      }
    }

    // Corner-case: if user interacts with Ambire, then interacts with another
    // wallet app (installed on the computer or a web app) and then comes back
    // to Ambire, the Ledger device might not respond to all requests. Therefore
    // we might receive only some of the keys, but not all of them.
    // To reproduce: 1. Plug in and unlock Ledger, open Ambire, import accounts;
    // 2. Now switch to Ledger Live and connect (My Ledger); 3. Switch back to
    // Ambire and try importing accounts again.
    const notAllKeysGotRetrieved = keys.length !== paths.length
    if (notAllKeysGotRetrieved) {
      throw (
        latestGetAddressError ||
        new ExternalSignerError('Failed to get all addresses from Ledger device.')
      )
    }

    return keys
  }

  async signPersonalMessage(derivationPath: string, messageHex: string) {
    if (!this.signerEth) throw new ExternalSignerError(normalizeLedgerMessage())

    const messageBytes = hexStringToUint8Array(messageHex)

    return this.#handleLedgerSubscription<LedgerSignature>(
      this.signerEth.signMessage(getHdPathWithoutRoot(derivationPath), messageBytes).observable,
      {
        onCompleted: (output) => output,
        errorMessage: 'Failed to sign message with Ledger device',
        isSign: true
      }
    )
  }

  async signTransaction(derivationPath: string, transaction: Uint8Array) {
    if (!this.signerEth) throw new ExternalSignerError(normalizeLedgerMessage())

    return this.#handleLedgerSubscription<LedgerSignature>(
      this.signerEth.signTransaction(getHdPathWithoutRoot(derivationPath), transaction).observable,
      {
        onCompleted: (output) => output,
        errorMessage: 'Failed to sign transaction with Ledger device',
        isSign: true
      }
    )
  }

  /**
   * Attempts to sign an EIP-712 message using the Ledger device. With Ledger DSK lib,
   * if the device does not support direct (clear) EIP-712 signing, it should internally
   * fallback to signing hashes of the message, no additional steps needed.
   */
  signTypedData = async ({
    path,
    signTypedData: { domain, types, message, primaryType }
  }: {
    path: string
    signTypedData: TypedMessage
  }) => {
    if (!this.signerEth) throw new ExternalSignerError(normalizeLedgerMessage())
    // TODO: Slight mismatch between TypedMessage type and Ledger's TypedDataDomain
    // for the empty values (string | null | undefined vs string | undefined)
    const ledgerDomain = { ...domain } as TypedDataDomain

    return this.#handleLedgerSubscription<LedgerSignature>(
      this.signerEth.signTypedData(getHdPathWithoutRoot(path), {
        domain: ledgerDomain,
        types,
        message,
        primaryType
      }).observable,
      {
        onCompleted: (output) => output,
        errorMessage: 'Failed to sign typed data with Ledger device',
        isSign: true
      }
    )
  }

  async signingCleanup() {
    if (!this.#rejectSigningSubscription) return

    this.#rejectSigningSubscription()
    this.#rejectSigningSubscription = null
  }

  cleanUp = async () => {
    if (this.walletSDK) this.walletSDK.close()

    this.walletSDK = null
    this.signerEth = null
    this.unlockedPath = ''
    this.unlockedPathKeyAddr = ''

    if ('hid' in navigator) navigator.hid.removeEventListener('disconnect', this.cleanUpListener)
  }

  async cleanUpListener({ device }: { device: HIDDevice }) {
    if (device.vendorId === LedgerController.vendorId) await this.cleanUp()
  }
}

export default LedgerController
