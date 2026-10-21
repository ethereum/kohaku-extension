/**
 * @jest-environment jsdom
 *
 * The edit page over a client whose fake node starts afresh, below the setup
 * nonce of the attempt the watcher last read for the account at the same
 * manager and action: the page reads the facts as failed with retry, never as
 * no setup.
 */
import type { RecordStorage } from '@web/modules/social-recovery/shared/records'

const mockStore: { storage: RecordStorage | null; client: unknown } = {
  storage: null,
  client: null
}

jest.mock('@web/modules/social-recovery/shared/records/extensionStorage', () => ({
  get extensionRecordStorage() {
    return mockStore.storage
  }
}))
jest.mock('@web/modules/social-recovery/shared/client/useRecoveryClient', () => ({
  useRecoveryClient: () => mockStore.client
}))
jest.mock('@common/utils/clipboard', () => ({ setStringAsync: async () => true }))
jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: jest.fn() })
}))
jest.mock('@common/components/Avatar', () => ({ __esModule: true, default: () => null }))
// The route's chrome is not drawn here: the stage view renders inside it.
jest.mock('@web/modules/social-recovery/shared/chrome/SetupChrome', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@web/modules/social-recovery/shared/chrome/useSetupAccount', () => ({
  __esModule: true,
  default: () => ({})
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const harness: typeof import('@web/modules/social-recovery/management/overview/__fixtures__/harness') = require('@web/modules/social-recovery/management/overview/__fixtures__/harness')
const {
  EditStageView
}: typeof import('@web/modules/social-recovery/management/editor/EditScreen') = require('@web/modules/social-recovery/management/editor/EditScreen')
const {
  editSessionOf
}: typeof import('@web/modules/social-recovery/management/editor/session') = require('@web/modules/social-recovery/management/editor/session')
const {
  CHAIN_IDS,
  WALLET_RECOVERY_CHAIN
}: typeof import('@web/modules/social-recovery/shared/client') = require('@web/modules/social-recovery/shared/client')
const {
  createWalletRecords
}: typeof import('@web/modules/social-recovery/shared/records') = require('@web/modules/social-recovery/shared/records')
const {
  makeStorage
}: typeof import('@web/modules/social-recovery/shared/records/__fixtures__/storage') = require('@web/modules/social-recovery/shared/records/__fixtures__/storage')
const {
  updateWatcherRecord
}: typeof import('@web/modules/social-recovery/watcher') = require('@web/modules/social-recovery/watcher')
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

const { ACCOUNT, ADDRESS_BOOK, freshClientOf, mount, readyOver, settleReads } = harness
const CHAIN_ID = CHAIN_IDS[WALLET_RECOVERY_CHAIN]

describe('the edit page over a fresh node', () => {
  it('reads an answer below the setup nonce of the attempt the watcher read as failed with retry', async () => {
    const storage = makeStorage()
    mockStore.storage = storage
    await updateWatcherRecord(storage, CHAIN_ID, ACCOUNT, () => ({
      reading: {
        account: ACCOUNT,
        block: { number: 1000, timestamp: 1 },
        hasSetup: true,
        dormant: false,
        attempt: {
          attemptId: 1n,
          setupNonce: 1n,
          payloadHash: `0x${'11'.repeat(32)}`,
          consumableAfter: 2,
          executionDue: false
        },
        deployment: { manager: ADDRESS_BOOK.manager, action: ADDRESS_BOOK.action }
      },
      dismissed: []
    }))
    mockStore.client = readyOver(await freshClientOf())

    const view = await mount(
      React.createElement(EditStageView, {
        records: createWalletRecords({ storage }),
        session: editSessionOf(storage, CHAIN_ID, ACCOUNT),
        chainId: CHAIN_ID,
        account: ACCOUNT,
        navigate: jest.fn()
      })
    )
    await settleReads()

    expect(view.byTestId('manage-edit-reads-facts-failed')).not.toBeNull()
    expect(view.byTestId('manage-edit-reads-not-set-up')).toBeNull()
    view.unmount()
  })
})
