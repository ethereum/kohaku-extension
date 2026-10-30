/**
 * @jest-environment jsdom
 *
 * The keys the overview asks about after an executed recovery: every key the
 * keystore holds, whichever account it was made for, none until the keystore
 * is read, and the same list while the keystore names the same keys.
 */
import type { Address } from '@kohaku-eth/social-recovery'
import type { KeystoreMock } from '@web/modules/social-recovery/management/overview/__fixtures__/types'

const mockKeystore: KeystoreMock = { keys: undefined }
jest.mock('@web/hooks/useKeystoreControllerState', () => ({
  __esModule: true,
  default: () => mockKeystore
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const {
  mount
}: typeof import('@web/modules/social-recovery/cancel/__fixtures__/mount') = require('@web/modules/social-recovery/cancel/__fixtures__/mount')
const {
  useHeldKeys
}: typeof import('@web/modules/social-recovery/management/overview/useHeldKeys') = require('@web/modules/social-recovery/management/overview/useHeldKeys')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const OWN = '0x00000000000000000000000000000000000000f1'
const OTHER = '0x00000000000000000000000000000000000000f2'

const seen: (readonly Address[] | undefined)[] = []
const Probe = () => {
  seen.push(useHeldKeys())
  return null
}

describe('the keys this wallet holds', () => {
  afterEach(() => {
    seen.length = 0
    mockKeystore.keys = undefined
  })

  it('names none until the keystore is read, then every key it holds, of any account', async () => {
    const view = await mount(<Probe />)
    expect(seen[seen.length - 1]).toBeUndefined()

    mockKeystore.keys = [
      { addr: OWN, type: 'internal' },
      { addr: OTHER, type: 'internal' }
    ]
    await view.render(<Probe />)
    expect(seen[seen.length - 1]).toEqual([OWN, OTHER])
    view.unmount()
  })

  it('keeps the same list while the keystore names the same keys', async () => {
    mockKeystore.keys = [{ addr: OWN, type: 'internal' }]
    const view = await mount(<Probe />)
    const first = seen[seen.length - 1]
    mockKeystore.keys = [{ addr: OWN, type: 'internal' }]
    await view.render(<Probe />)
    expect(seen[seen.length - 1]).toBe(first)
    view.unmount()
  })
})
