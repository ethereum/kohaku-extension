import { getAddress } from 'viem'

import shortenAddress from '@ambire-common/utils/shortenAddress'
import {
  getPaidByAddressLine,
  getPaidByLabel
} from '@web/modules/sign-account-op/components/Estimation/components/PayOption'

// The row's views and controller hooks reach the browser and the background
// service, which the node environment has not; the label needs none of them.
jest.mock('@common/assets/svg/WarningIcon', () => ({ __esModule: true, default: () => null }))
jest.mock('@common/components/Avatar', () => ({ __esModule: true, default: () => null }))
jest.mock('@common/components/Text', () => ({ __esModule: true, default: () => null }))
jest.mock('@common/components/TokenIcon', () => ({ __esModule: true, default: () => null }))
jest.mock('@common/components/Tooltip', () => ({ __esModule: true, default: () => null }))
jest.mock('@common/hooks/useTheme', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@web/hooks/useAccountsControllerState', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@web/hooks/useKeystoreControllerState', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@web/hooks/useNetworksControllerState', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@web/hooks/useSelectedAccountControllerState', () => ({
  __esModule: true,
  default: jest.fn()
}))
jest.mock('@web/hooks/useSignAccountOpControllerState', () => ({
  __esModule: true,
  default: jest.fn()
}))

const LISTED = getAddress('0x2222222222222222222222222222222222222222')
const KEY = getAddress('0x1aaa1bbb1ccc1ddd1eee1fff1aaa1bbb1ccc1ddd')
const UNKNOWN = getAddress('0x9999999999999999999999999999999999999999')

const accounts = [{ addr: LISTED, preferences: { label: 'Savings', pfp: LISTED } }]

describe('the label of the fee payer', () => {
  it('shows a listed account label', () => {
    expect(getPaidByLabel(LISTED, accounts, [])).toBe('Savings')
  })

  it('prefers the listed account label over a keystore key label for the same address', () => {
    expect(getPaidByLabel(LISTED, accounts, [{ addr: LISTED, label: 'Key 1' }])).toBe('Savings')
  })

  it('shows the keystore key label for a payer that is a key and not a listed account', () => {
    expect(getPaidByLabel(KEY, accounts, [{ addr: KEY, label: 'Ledger key' }])).toBe('Ledger key')
  })

  it('finds the keystore key whatever the case of its address', () => {
    expect(getPaidByLabel(KEY.toLowerCase(), accounts, [{ addr: KEY, label: 'Ledger key' }])).toBe(
      'Ledger key'
    )
  })

  it('shows the short address of a keystore key with an empty label', () => {
    const label = getPaidByLabel(KEY, accounts, [{ addr: KEY, label: '' }])

    expect(label).toBe(shortenAddress(KEY, 13))
    expect(label).not.toBe(KEY)
  })

  it('gives no label for a payer the wallet does not know', () => {
    expect(getPaidByLabel(UNKNOWN, accounts, [{ addr: KEY, label: 'Ledger key' }])).toBeNull()
  })
})

describe('the address line under the fee payer label', () => {
  it('shows the short address under a listed account label', () => {
    expect(getPaidByAddressLine(LISTED, 'Savings')).toBe(shortenAddress(LISTED, 13))
  })

  it('shows the short address under a keystore key label', () => {
    expect(getPaidByAddressLine(KEY, 'Ledger key')).toBe(shortenAddress(KEY, 13))
  })

  it('shows no second line for a keystore key with an empty label, so the address shows once', () => {
    const label = getPaidByLabel(KEY, accounts, [{ addr: KEY, label: '' }]) as string

    expect(getPaidByAddressLine(KEY, label)).toBeNull()
  })
})
