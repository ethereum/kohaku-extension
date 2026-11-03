import { BIP44_STANDARD_DERIVATION_TEMPLATE } from '@ambire-common/consts/derivation'
import { KeyIterator } from '@ambire-common/libs/keyIterator/keyIterator'
import { handleActions } from '@web/extension-services/background/handlers/handleActions'

// The background's controller map loads every controller of the wallet, and the
// hardware iterators load their device transports; the picker's init reads none.
jest.mock('@web/extension-services/background/types', () => ({
  controllersNestedInMainMapping: {}
}))
jest.mock('@web/modules/hardware-wallet/libs/latticeKeyIterator', () => ({}))
jest.mock('@web/modules/hardware-wallet/libs/ledgerKeyIterator', () => ({}))
jest.mock('@web/modules/hardware-wallet/libs/trezorKeyIterator', () => ({}))

const SEED = 'test test test test test test test test test test test junk'
const PICKER_INIT = 'MAIN_CONTROLLER_ACCOUNT_PICKER_INIT_PRIVATE_KEY_OR_SEED_PHRASE'

describe('the background opening the picker on a seed', () => {
  const setInitParams = jest.fn()
  const context = { mainCtrl: { accountPicker: { setInitParams } } } as unknown as Parameters<
    typeof handleActions
  >[1]

  beforeEach(() => {
    setInitParams.mockClear()
  })

  it('hands the picker the request to select the smart account when a new seed asks for it', async () => {
    await handleActions(
      {
        type: PICKER_INIT,
        params: { privKeyOrSeed: SEED, shouldSelectSmartAccountAutomatically: true }
      },
      context
    )

    expect(setInitParams).toHaveBeenCalledTimes(1)
    const [initParams] = setInitParams.mock.calls[0]
    expect(initParams.keyIterator).toBeInstanceOf(KeyIterator)
    expect(initParams.hdPathTemplate).toBe(BIP44_STANDARD_DERIVATION_TEMPLATE)
    expect(initParams.shouldSelectSmartAccountAutomatically).toBe(true)
  })

  it('leaves the request unset for an import', async () => {
    await handleActions(
      { type: PICKER_INIT, params: { privKeyOrSeed: SEED, seedPassphrase: null } },
      context
    )

    expect(setInitParams).toHaveBeenCalledTimes(1)
    const [initParams] = setInitParams.mock.calls[0]
    expect(initParams.keyIterator).toBeInstanceOf(KeyIterator)
    expect(initParams.shouldSelectSmartAccountAutomatically).toBeUndefined()
  })
})
