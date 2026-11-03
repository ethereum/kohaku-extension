/**
 * Where the checklist takes the setup's configuration from: the decrypted
 * cache of the client's deployment, else the recovery password held in
 * memory, else nothing.
 */
import type { Address, Configuration } from '@kohaku-eth/social-recovery'
import type { ConfigurationInput } from '@web/modules/social-recovery/recovery/checklist'
import { configurationOf } from '@web/modules/social-recovery/recovery/checklist'
import { createWalletRecords } from '@web/modules/social-recovery/shared/records'
import { makeStorage } from '@web/modules/social-recovery/shared/records/__fixtures__/storage'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const MANAGER: Address = '0x4444444444444444444444444444444444444444'
const RETIRED_MANAGER: Address = '0x6666666666666666666666666666666666666666'
const ACTION: Address = '0x5555555555555555555555555555555555555555'
const CHAIN_ID = 11155111n
const PASSWORD = 'correct horse battery staple'

const CACHED: Configuration = { clauses: [], wait: 1, ignoresPause: false }
const CURRENT: Configuration = { clauses: [], wait: 2, ignoresPause: false }

const inputOf = (password: string | undefined) => {
  const records = createWalletRecords({ storage: makeStorage() })
  const getSetup = jest.fn(async () => CURRENT)
  const input: ConfigurationInput = {
    records,
    chainId: CHAIN_ID,
    account: ACCOUNT,
    client: {
      setup: { getSetup },
      descriptor: { manager: MANAGER, action: ACTION }
    } as unknown as ConfigurationInput['client'],
    password
  }
  return { input, records, getSetup }
}

describe('the configuration the checklist opens with', () => {
  it('takes the cache read from the manager and action the client reads', async () => {
    const { input, records, getSetup } = inputOf(PASSWORD)
    await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).write({
      configuration: CACHED,
      setupNonce: 1n,
      deployment: { manager: MANAGER, action: ACTION }
    })

    expect(await configurationOf(input)).toEqual({
      kind: 'configuration',
      configuration: CACHED,
      source: 'cache'
    })
    expect(getSetup).not.toHaveBeenCalled()
  })

  it('opens the setup with the password held over a cache of a retired manager', async () => {
    const { input, records, getSetup } = inputOf(PASSWORD)
    await records.decryptedSetupCache(CHAIN_ID, ACCOUNT).write({
      configuration: CACHED,
      setupNonce: 1n,
      deployment: { manager: RETIRED_MANAGER, action: ACTION }
    })

    expect(await configurationOf(input)).toEqual({
      kind: 'configuration',
      configuration: CURRENT,
      source: 'password'
    })
    expect(getSetup).toHaveBeenCalledWith({ password: PASSWORD })
  })

  it('answers none over a cache that names no deployment where no password is held', async () => {
    const { input, records } = inputOf(undefined)
    await records
      .decryptedSetupCache(CHAIN_ID, ACCOUNT)
      .write({ configuration: CACHED, setupNonce: 1n })

    expect(await configurationOf(input)).toEqual({ kind: 'none' })
  })
})
