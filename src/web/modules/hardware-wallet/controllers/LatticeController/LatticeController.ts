import crypto from 'crypto'
import { Client as GridPlusSDKClient, Constants as GridPlusSDKConstants } from 'gridplus-sdk'

import ExternalSignerError from '@ambire-common/classes/ExternalSignerError'
import { ExternalKey, ExternalSignerController } from '@ambire-common/interfaces/keystore'
import { browser } from '@web/constants/browserapi'

export { GridPlusSDKConstants }

const LATTICE_APP_NAME = 'Ambire Wallet (browser)' // should be 6-23 characters
const LATTICE_MANAGER_URL = 'https://lattice.gridplus.io'
const LATTICE_BASE_URL = 'https://signing.gridpl.us'

const SDK_TIMEOUT = 120000
const CONNECT_TIMEOUT = 20000

class LatticeController implements ExternalSignerController {
  walletSDK?: GridPlusSDKClient | null

  creds: any

  unlockedAccount: any

  deviceId = ''

  // There is only one Grid+ device
  deviceModel = 'lattice1'

  constructor() {
    this._resetDefaults()
  }

  // Determine if we have a connection to the Lattice and an existing wallet UID
  // against which to make requests.
  isUnlocked() {
    const activeWallet = this._getCurrentWalletUID()
    // If the current wallet UID is different, it means that 1) The device has
    // changed or 2) The Lattice device is currently unlocked with different
    // (seed) wallet - the device itself can hold one (seed) wallet, and the
    // SafeCard connected can hold another (seed) wallet. In case of a mismatch,
    // we need to reconnect to the Lattice (treat it as locked).
    const walletDetailsExist = !!activeWallet && !!this.deviceId
    const isSameWallet = walletDetailsExist && activeWallet === this.deviceId

    return isSameWallet && !!this.walletSDK
  }

  async unlock(
    _path: string,
    _expectedKeyOnThisPath?: string,
    shouldOpenLatticeConnectorInTab = false
  ) {
    // TODO: `_path` and `_expectedKeyOnThisPath` are not validated here,
    // figure out if they should.

    if (this.isUnlocked()) {
      // Even if unlocked, reconnect to the Lattice to ensure the correct wallet.
      // Otherwise, if the user has changed the active wallet, errors get thrown.
      await this._connect()

      return 'ALREADY_UNLOCKED'
    }

    // Initialize a session with the Lattice1 device using the GridPlus SDK
    // NOTE: `bypassOnStateData=true` allows us to rehydrate a new SDK session without
    // reconnecting to the target Lattice. This is only currently used for signing
    // because it eliminates the need for 2 connection requests and shaves off ~4-6sec.
    // We avoid passing `bypassOnStateData=true` for other calls on `unlock` to avoid
    // possible edge cases related to this new functionality (it's probably fine - just
    // being cautious). In the future we may remove `bypassOnStateData` entirely.
    // TODO: Currently not implemented
    const bypassOnStateData = false

    const creds: any = await this._getCreds(shouldOpenLatticeConnectorInTab)
    if (creds) {
      this.creds.deviceID = creds.deviceID
      this.creds.password = creds.password
      this.creds.endpoint = creds.endpoint || null
    }
    const includedStateData = await this._initSession()

    // If state data was provided and if we are authorized to
    // bypass reconnecting, we can exit here.
    if (includedStateData && bypassOnStateData) return 'ALREADY_UNLOCKED'

    await this._connect()
    return 'JUST_UNLOCKED'
  }

  _resetDefaults() {
    this.creds = {
      deviceID: null,
      password: null,
      endpoint: null
    }
    this.deviceId = ''
    this.walletSDK = null
  }

  async _openLatticeConnector(url: string, shouldOpenInTab: boolean) {
    try {
      if (shouldOpenInTab) {
        const tab = await browser.tabs.create({ url })
        return tab.id
      }

      const ref = await browser.windows.create({ url, type: 'popup' })
      return ref.tabs[0].id
    } catch (err) {
      throw new ExternalSignerError('Failed to open the Lattice Connector.', {
        sendCrashReport: true
      })
    }
  }

  async _findTabById(id) {
    const tabs = await browser.tabs.query({})
    return tabs.find((tab) => tab.id === id)
  }

  async _getCreds(shouldOpenLatticeConnectorInTab: boolean) {
    if (this._hasCreds()) return

    const url = `${LATTICE_MANAGER_URL}?keyring=${LATTICE_APP_NAME}&forceLogin=true`
    let listenInterval: ReturnType<typeof setInterval>

    const tabId = await this._openLatticeConnector(url, shouldOpenLatticeConnectorInTab)

    // Ugly workaround that listens for changes to the URL which contains
    // the Lattice Connector login info.
    // NOTE: This will only work if have `https://lattice.gridplus.io/*` (or wildcard)
    // host permissions in your manifest file and also `activeTab` permission.
    // TODO: Could maybe be achieved with a content script that sends a message
    // to the background script with the login data.
    const loginUrlParam = '&loginCache='
    return new Promise((resolve, reject) => {
      listenInterval = setInterval(async () => {
        try {
          const tab = await this._findTabById(tabId)
          if (!tab || !tab.url) {
            clearInterval(listenInterval)
            return reject(
              new ExternalSignerError('Closing the Lattice Connector interrupted the connection.')
            )
          }

          // If the tab we opened contains a new URL param
          const paramLoc = tab.url.indexOf(loginUrlParam)
          if (paramLoc < 0) return

          const dataLoc = paramLoc + loginUrlParam.length
          // Stop this interval
          clearInterval(listenInterval)
          // Parse the login data. It is a stringified JSON object
          // encoded as a base64 string.
          const credsString = Buffer.from(tab.url.slice(dataLoc), 'base64').toString()

          // Close the tab and return the credentials
          await browser.tabs.remove(tab.id)

          const creds = JSON.parse(credsString)
          if (!creds.deviceID || !creds.password) {
            return reject(new ExternalSignerError('Invalid credentials returned from Lattice.'))
          }

          resolve(creds)
        } catch (err) {
          clearInterval(listenInterval)
          reject(
            new ExternalSignerError('Failed to get login data from Lattice. Please try again.', {
              sendCrashReport: true
            })
          )
        }
      }, 500)
    })
  }

  // [re]connect to the Lattice. This should be done frequently to ensure
  // the expected wallet UID is still the one active in the Lattice.
  // This will handle SafeCard insertion/removal events.
  async _connect() {
    if (!this.walletSDK)
      throw new ExternalSignerError(
        'Could not connect to the Lattice1 device. Please try again or contact Ambire support.',
        {
          sendCrashReport: true
        }
      )

    try {
      // Attempt to connect with a Lattice using a shorter timeout. If
      // the device is unplugged it will time out and we don't need to wait
      // 2 minutes for that to happen.
      this.walletSDK.timeout = CONNECT_TIMEOUT
      await this.walletSDK.connect(this.creds.deviceID)
      this.deviceId = this._getCurrentWalletUID()
    } finally {
      // Reset to normal timeout no matter what
      this.walletSDK.timeout = SDK_TIMEOUT
    }
  }

  async _initSession() {
    const setupData = {
      name: LATTICE_APP_NAME,
      baseUrl: this.creds.endpoint || LATTICE_BASE_URL,
      timeout: SDK_TIMEOUT,
      privKey: this._genSessionKey(),
      skipRetryOnWrongWallet: true
    }
    /*
    NOTE: We need state to actually be synced by MetaMask or we can't
    use this. See: https://github.com/MetaMask/KeyringController/issues/130
    if (this.sdkState) {
      // If we have state data we can fully rehydrate the session.
      setupData = {
        stateData: this.sdkState,
        skipRetryOnWrongWallet: true,
      }
    }
    */
    this.walletSDK = new GridPlusSDKClient(setupData)
    // Return a boolean indicating whether we provided state data.
    // If we have, we can skip `connect`.
    return !!setupData.stateData
  }

  _hasCreds() {
    return this.creds.deviceID !== null && this.creds.password !== null
  }

  _genSessionKey() {
    if (!this._hasCreds())
      throw new ExternalSignerError('No credentials -- cannot create session key!', {
        sendCrashReport: true
      })
    const buf = Buffer.concat([
      Buffer.from(this.creds.password),
      Buffer.from(this.creds.deviceID),
      Buffer.from(LATTICE_APP_NAME)
    ])

    return crypto.createHash('sha256').update(buf).digest()
  }

  _getCurrentWalletUID() {
    if (!this.walletSDK) {
      return ''
    }
    const activeWallet = this.walletSDK.getActiveWallet()
    if (!activeWallet || !activeWallet.uid) {
      return ''
    }
    return activeWallet.uid.toString('hex')
  }

  async _keyIdxInCurrentWallet(key: ExternalKey) {
    // Get the last updated SDK wallet UID
    const activeWallet = this.walletSDK!.getActiveWallet()
    if (!activeWallet) await this._connect()

    const activeUID = activeWallet.uid.toString('hex')
    // If this is already the active wallet we don't need to make a request
    if (key.meta.deviceId === activeUID) {
      return key.meta!.index
    }
    return null
  }
}

export default LatticeController
