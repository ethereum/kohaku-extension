/**
 * The committed configuration loaded into the setup records and read back,
 * the edit session taken up under the same setup and started again once the
 * setup moved or its setup draft is gone, and the session's storage read,
 * which keeps nothing it cannot read as a session.
 */
import i18n from '@common/config/localization'
import {
  configurationOfDraft,
  openEditSession,
  recordsOfConfiguration,
  writeLoadedRecords
} from '@web/modules/social-recovery/management/editor/load'
import {
  editSessionFrom,
  editSessionKeyOf,
  editSessionOf
} from '@web/modules/social-recovery/management/editor/session'
import type { Configuration, SetupState } from '@kohaku-eth/social-recovery'
import type { PrivacyLevel } from '@web/modules/social-recovery/shared/client'
import { PRIVACY_LEVELS, privacyLevelOf } from '@web/modules/social-recovery/shared/client'
import {
  addMember,
  renderRowChip,
  rowChipTone,
  thresholdsSetOf
} from '@web/modules/social-recovery/setup/editor'
import { recordTest } from '@web/modules/social-recovery/setup/enroll/writes'
import { untestedInPath } from '@web/modules/social-recovery/setup/review'
import { createWalletRecords } from '@web/modules/social-recovery/shared/records'
import { makeStorage } from '@web/modules/social-recovery/shared/records/__fixtures__/storage'

const ACCOUNT = '0x00000000000000000000000000000000000a11ce' as const
const CHAIN_ID = 11155111

const CONFIGURATION: Configuration = {
  clauses: [
    {
      threshold: 2,
      credentials: [
        { method: '0x0000000000000000000000000000000000000001', config: '0x01' },
        { method: '0x0000000000000000000000000000000000000002', config: '0x02', label: 'Laptop' },
        { method: '0x0000000000000000000000000000000000000003', config: '0x03', salt: '0x09' }
      ]
    },
    {
      threshold: 1,
      credentials: [{ method: '0x0000000000000000000000000000000000000004', config: '0x04' }]
    }
  ],
  wait: 259_200,
  ignoresPause: true
}

const stateAt = (nonce: bigint): SetupState => ({
  isAuthorized: true,
  hasSetup: true,
  setupCommitment: `0x${nonce.toString(16).padStart(64, '0')}`,
  setupNonce: nonce,
  setupCommittedAtBlock: 10,
  attemptActive: false,
  block: { number: 20, timestamp: 2_000, hash: `0x${'11'.repeat(32)}` }
})

const worldOf = () => {
  const storage = makeStorage()
  const records = createWalletRecords({ storage })
  return {
    storage,
    setup: records.setup(CHAIN_ID, ACCOUNT),
    session: editSessionOf(storage, CHAIN_ID, ACCOUNT)
  }
}

describe('the load of a committed configuration', () => {
  it('reads back as the configuration at every level', () => {
    PRIVACY_LEVELS.forEach((level: PrivacyLevel) => {
      const loaded = recordsOfConfiguration(CONFIGURATION, level)
      expect(configurationOfDraft(loaded.setupDraft)).toEqual(CONFIGURATION)
      expect(privacyLevelOf(loaded.setupDraft.privacy)).toBe(level)
      expect(loaded.waitingPeriod).toBe(CONFIGURATION.wait)
      expect(loaded.hidden).toBe(level !== 'public')
    })
  })

  it('holds one enrollment for each committed row, each read as live', () => {
    const { enrollments } = recordsOfConfiguration(CONFIGURATION, 'private')
    expect(enrollments.map(({ credential }) => credential)).toEqual(
      CONFIGURATION.clauses.flatMap(({ credentials }) => credentials)
    )
    expect(enrollments.every(({ test }) => test === 'live')).toBe(true)
  })

  it('reads a committed row as live and never as untested, and a test run on it as that test reads', async () => {
    const t = (key: string) => String(i18n.t(key))
    const loaded = recordsOfConfiguration(CONFIGURATION, 'private')
    const [row] = CONFIGURATION.clauses[0].credentials
    expect(renderRowChip(row, loaded.enrollments, t)).toBe(t('socialRecovery.status.method.live'))
    expect(rowChipTone(row, loaded.enrollments)).toBe('success')
    expect(untestedInPath(CONFIGURATION.clauses, loaded.enrollments)).toEqual([])

    const setup = createWalletRecords({ storage: makeStorage() }).setup(CHAIN_ID, ACCOUNT)
    await writeLoadedRecords(setup, loaded)
    const passed = await recordTest(setup, row, 'passed')
    expect(passed && renderRowChip(row, [passed], t)).toBe(t('socialRecovery.status.method.tested'))
    const failed = await recordTest(setup, row, 'failed')
    expect(failed && renderRowChip(row, [failed], t)).toBe(
      t('socialRecovery.status.method.testFailed')
    )
  })

  it('leaves the committed configuration alone when the records change', () => {
    const loaded = recordsOfConfiguration(CONFIGURATION, 'private')
    expect(loaded.setupDraft.clauses[0].credentials).not.toBe(CONFIGURATION.clauses[0].credentials)
    expect(loaded.setupDraft.clauses[0].credentials).toEqual(CONFIGURATION.clauses[0].credentials)
  })
})

describe('the edit session', () => {
  it('loads the records and starts a session over the setup the chain holds', async () => {
    const world = worldOf()
    const opened = await openEditSession({
      ...world,
      state: stateAt(4n),
      configuration: CONFIGURATION,
      level: 'shape-visible'
    })
    expect(opened).toEqual({
      configuration: CONFIGURATION,
      setupNonce: 4n,
      setupCommitment: stateAt(4n).setupCommitment,
      level: 'shape-visible',
      password: 'kept'
    })
    expect(await world.session.read()).toEqual(opened)
    const draft = await world.setup.setupDraft.read()
    const path = await world.setup.path.read()
    const flag = await world.setup.passwordSet.read()
    expect(draft.status === 'present' && configurationOfDraft(draft.value)).toEqual(CONFIGURATION)
    expect(path.status === 'present' && path.value).toEqual(CONFIGURATION.clauses)
    expect(flag.status).toBe('present')
  })

  it('takes up the edit under the same setup, with the records it left', async () => {
    const world = worldOf()
    const input = { ...world, configuration: CONFIGURATION, level: 'private' as const }
    await openEditSession({ ...input, state: stateAt(4n) })
    const edited = { ...recordsOfConfiguration(CONFIGURATION, 'private').setupDraft, wait: 86_400 }
    await world.setup.writeDraftAndPath(edited)
    await world.session.write({ ...(await world.session.read())!, password: 'changed' })

    const again = await openEditSession({ ...input, state: stateAt(4n) })

    expect(again.password).toBe('changed')
    const draft = await world.setup.setupDraft.read()
    expect(draft.status === 'present' && draft.value.wait).toBe(86_400)
  })

  it('starts again from the chain once the setup moved', async () => {
    const world = worldOf()
    const input = { ...world, configuration: CONFIGURATION, level: 'private' as const }
    await openEditSession({ ...input, state: stateAt(4n) })
    await world.setup.writeDraftAndPath({
      ...recordsOfConfiguration(CONFIGURATION, 'private').setupDraft,
      wait: 86_400
    })

    const again = await openEditSession({ ...input, state: stateAt(5n) })

    expect(again.setupNonce).toBe(5n)
    expect(again.password).toBe('kept')
    const draft = await world.setup.setupDraft.read()
    expect(draft.status === 'present' && draft.value.wait).toBe(CONFIGURATION.wait)
  })

  it('loads the chain again where the session stands but its setup draft is gone', async () => {
    const world = worldOf()
    const input = { ...world, configuration: CONFIGURATION, level: 'private' as const }
    await openEditSession({ ...input, state: stateAt(4n) })
    await world.session.write({ ...(await world.session.read())!, password: 'changed' })
    await world.setup.setupDraft.wipe()

    const again = await openEditSession({ ...input, state: stateAt(4n) })

    expect(again.password).toBe('kept')
    const draft = await world.setup.setupDraft.read()
    expect(draft.status === 'present' && configurationOfDraft(draft.value)).toEqual(CONFIGURATION)
  })

  it("keeps a committed group's threshold when the edit adds a member to it", () => {
    const configuration: Configuration = {
      ...CONFIGURATION,
      clauses: [
        { threshold: 1, credentials: [CONFIGURATION.clauses[0].credentials[0]] },
        {
          threshold: 1,
          credentials: [
            CONFIGURATION.clauses[0].credentials[1],
            CONFIGURATION.clauses[0].credentials[2]
          ]
        }
      ]
    }
    const { setupDraft } = recordsOfConfiguration(configuration, 'public')
    const flags = thresholdsSetOf(setupDraft)
    expect(flags).toEqual([false, true])
    const added = addMember(
      setupDraft.clauses,
      1,
      { method: '0x0000000000000000000000000000000000000009', config: '0x09' },
      flags[1]
    )
    expect(added.status === 'applied' && added.clauses[1].threshold).toBe(1)
  })

  it('reads a stored value it cannot read as a session as none', async () => {
    const world = worldOf()
    const key = editSessionKeyOf(CHAIN_ID, ACCOUNT)
    await world.storage.set(key, { value: { configuration: CONFIGURATION }, savedAt: 1 })
    expect(await world.session.read()).toBeUndefined()
    expect(editSessionFrom(null)).toBeUndefined()
    expect(editSessionFrom({ value: { level: 'open' } })).toBeUndefined()
  })

  const storedSessionWith = (credential: unknown) => ({
    value: {
      configuration: {
        ...CONFIGURATION,
        clauses: [{ threshold: 1, credentials: [credential] }]
      },
      setupNonce: 4n,
      setupCommitment: stateAt(4n).setupCommitment,
      level: 'public',
      password: 'kept'
    },
    savedAt: 1
  })

  it('reads a stored session whose credentials are well formed', () => {
    expect(
      editSessionFrom(
        storedSessionWith({ method: '0x0000000000000000000000000000000000000002', config: '0x02' })
      )
    ).toBeDefined()
  })

  const MALFORMED_CREDENTIALS = [
    {
      name: 'a config that is not hex',
      credential: { method: '0x0000000000000000000000000000000000000002', config: 'zz' }
    },
    { name: 'a method that is not an address', credential: { method: '0x02', config: '0x02' } },
    {
      name: 'a numeric label',
      credential: { method: '0x0000000000000000000000000000000000000002', config: '0x02', label: 7 }
    },
    { name: 'an array', credential: ['0x0000000000000000000000000000000000000002', '0x02'] }
  ]
  MALFORMED_CREDENTIALS.forEach(({ name, credential }) => {
    it(`reads a stored session holding a credential with ${name} as none`, () => {
      expect(editSessionFrom(storedSessionWith(credential))).toBeUndefined()
    })
  })

  it('wipes the session', async () => {
    const world = worldOf()
    await openEditSession({
      ...world,
      state: stateAt(4n),
      configuration: CONFIGURATION,
      level: 'public'
    })
    await world.session.wipe()
    expect(await world.session.read()).toBeUndefined()
  })
})
