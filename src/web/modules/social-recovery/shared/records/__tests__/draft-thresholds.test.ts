/**
 * The setup draft carries one flag per clause that says whether the holder set
 * its threshold. The flags land with the clauses and the path in one write,
 * and read back as written; a draft stored without them, or with a list that
 * is not one boolean per clause, reads with none.
 */
import type { Address } from '@kohaku-eth/social-recovery'
import {
  createWalletRecords,
  defaultSetupDraft,
  recordKeys
} from '@web/modules/social-recovery/shared/records'
import { makeStorage } from '@web/modules/social-recovery/shared/records/__fixtures__/storage'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const CHAIN_ID = 11155111n
const METHOD: Address = '0x2222222222222222222222222222222222222222'

const CLAUSES = [
  { threshold: 1, credentials: [{ method: METHOD, config: '0x01' as const }] },
  {
    threshold: 1,
    credentials: [
      { method: METHOD, config: '0x02' as const },
      { method: METHOD, config: '0x03' as const }
    ]
  }
]

const withStorage = () => {
  const storage = makeStorage()
  return { storage, setup: createWalletRecords({ storage }).setup(CHAIN_ID, ACCOUNT) }
}

describe('the threshold flags of the setup draft', () => {
  it('lands the flags with the clauses and the path, and reads them back after a reload', async () => {
    const { storage, setup } = withStorage()
    await setup.writeDraftAndPath({
      ...defaultSetupDraft(),
      clauses: CLAUSES,
      thresholdsSet: [false, true]
    })
    const reloaded = createWalletRecords({ storage }).setup(CHAIN_ID, ACCOUNT)
    const draft = await reloaded.setupDraft.read()
    const path = await reloaded.path.read()
    expect(draft.status === 'present' && draft.value.thresholdsSet).toEqual([false, true])
    expect(path.status === 'present' && path.value).toEqual(CLAUSES)
  })

  const NOT_FLAGS = [
    { name: 'no list', stored: undefined },
    { name: 'a list of another length', stored: [true] },
    { name: 'a list that holds something other than booleans', stored: [true, 'yes'] },
    { name: 'a value that is no list', stored: 'all' }
  ]
  NOT_FLAGS.forEach(({ name, stored }) =>
    it(`reads a draft stored with ${name} as one with no flags`, async () => {
      const { storage, setup } = withStorage()
      await storage.set(recordKeys.setup('setupDraft', CHAIN_ID, ACCOUNT), {
        value: { ...defaultSetupDraft(), clauses: CLAUSES, thresholdsSet: stored },
        savedAt: 1
      })
      const draft = await setup.setupDraft.read()
      expect(draft.status).toBe('present')
      expect(draft.status === 'present' && 'thresholdsSet' in draft.value).toBe(false)
    })
  )
})
