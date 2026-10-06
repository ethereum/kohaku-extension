/**
 * The setup client of a deployed kit, over the chain's reads: the setup-side
 * state, the description and the validation of a draft, the commit's prepare
 * and its check after the landing, and the restore of the committed
 * configuration from its backup. The clear and the events feed are not
 * served yet and refuse.
 *
 * Every member pins one block first and makes each read at it. A setup
 * commits `keccak256(abi.encode(account, action, nonce, body))` at the next
 * nonce, with the backup sealed under the recovery password at a hidden
 * level, in the clear at the public level, or empty; an account the action
 * does not hold as armed arms it first, in the same batch.
 */
import { decodeAbiParameters, size, zeroHash } from 'viem'

import {
  codedError,
  configurationOfDraft,
  DEFAULT_WAIT,
  finding,
  PASSKEY_CONFIG,
  restoreRefusal,
  validationRefusal
} from '@web/modules/social-recovery/sdk-doubles'
import { distinctAddresses } from '@web/modules/social-recovery/sdk-doubles/encoding'
import type {
  Address,
  BlockHeader,
  Configuration,
  ConfigurationSource,
  Finding,
  ISetupClient,
  PreparedBatch,
  PreparedCall,
  SetupConfirmation,
  SetupDescription,
  SetupDraft,
  SetupState,
  ValidationResult
} from '@web/modules/social-recovery/sdk-interfaces'

import { sameAddress } from '../../addresses'
import { privacyLevelOf } from '../../setup-notes'
import { holdsPrivilege } from '../../wallet-reads'
import {
  backupFormOf,
  clearBackupOf,
  EMPTY_BACKUP,
  openBackup,
  openClearBackup,
  sealBackup
} from '../backup'
import type { SetupLog } from '../events'
import {
  armingData,
  commitSetupData,
  placedCredentialsOf,
  setupBodyOf,
  setupCommitmentOf
} from '../formats'
import { draftFindingsOf, isBackupRefusal } from '../validation'
import { storedCommitCallOf } from './commit-call'
import { notServedEvents, notServedRefusal } from './not-served'
import { accountBatchOf, accountCallOf, pinnedBlockOf } from './prepared'
import { withNamedRevert } from './reverts'
import type { KitSetupContext, MethodStandingReads } from './types'

/** A module whose views reverted: answered with the empty name and version. */
const undeclared = (reads: MethodStandingReads): boolean =>
  reads.moduleInfo.answered &&
  reads.moduleInfo.value.name === '' &&
  reads.moduleInfo.value.version === ''

const distinctMethods = (draft: SetupDraft): Address[] =>
  distinctAddresses(
    draft.clauses.flatMap((clause) => clause.credentials.map((credential) => credential.method))
  )

export const createKitSetupClient = (ctx: KitSetupContext): ISetupClient => {
  const { account, descriptor, config, provider, manager, action, moduleReads, events } = ctx
  const actionAddress = descriptor.action
  const pin = () => pinnedBlockOf(provider, config)

  const secondary = (method: Address): boolean =>
    sameAddress(method, descriptor.methodAadhaar) ||
    sameAddress(method, descriptor.methodZkpassport)

  const methodReadsOf = (draft: SetupDraft): Promise<MethodStandingReads[]> =>
    Promise.all(
      distinctMethods(draft).map(async (method) => {
        const [moduleInfo, parties, paused] = await Promise.all([
          moduleReads.moduleInfo(method),
          moduleReads.trustedParties(method),
          moduleReads.paused(method)
        ])
        return { method, moduleInfo, parties, paused }
      })
    )

  /** The keys the account's creation grants a privilege, the keys of an account with no code. */
  const createdWith = (key: Address): boolean =>
    ctx.initialPrivileges.some(
      ([holder, privilege]) => sameAddress(holder, key) && holdsPrivilege(privilege)
    )

  /**
   * `manager.already-armed`: the last setup write of each other action this
   * account committed or cleared since the manager's deployment, where it
   * is a commit.
   */
  const armedElsewhere = async (blockNumber: number): Promise<Finding[]> => {
    const logs = await events.setupLogsOf(account, {
      from: descriptor.deployedAt,
      to: blockNumber
    })
    const last = new Map<string, SetupLog>()
    logs.forEach((log) => {
      if (!sameAddress(log.action, actionAddress)) {
        last.set(log.action.toLowerCase(), log)
      }
    })
    return [...last.values()]
      .filter((log) => log.kind === 'setup-committed')
      .map((log) =>
        finding('manager.already-armed', 'account', { action: log.action, nonce: log.nonce })
      )
  }

  /** The setup findings over the draft and the reads at one block. */
  const findingsAt = async (draft: SetupDraft, block: BlockHeader): Promise<ValidationResult> => {
    const { errors, warnings } = draftFindingsOf(draft, {
      account,
      descriptor,
      config,
      blockTimestamp: block.timestamp
    })

    const reads = await methodReadsOf(draft)
    reads.forEach((r) => {
      // An unanswered read says nothing about the method's stop or its
      // declaration, so validation refuses rather than pass the draft.
      if (!r.paused.answered) {
        throw codedError('read.unanswered', { read: 'manager.paused', module: r.method })
      }
      if (!r.moduleInfo.answered) {
        throw codedError('read.unanswered', { read: 'manager.moduleInfo', module: r.method })
      }
      if (!descriptor.shippedMethods.some((shipped) => sameAddress(shipped, r.method))) {
        warnings.push(
          finding('method.unshipped', 'credential', {
            method: r.method,
            probe: r.moduleInfo.value.supportsInterface,
            list: descriptor.shippedMethods,
            listFrom: 'descriptor'
          })
        )
      }
      if (undeclared(r)) {
        warnings.push(finding('method.no-declaration', 'credential', { method: r.method }))
      }
      if (r.paused.value) {
        warnings.push(
          finding('method.stopped', 'credential', {
            method: r.method,
            ignoresPause: draft.ignoresPause
          })
        )
      }
    })

    // The fit check read three ways, then the audit list and the probe.
    const [fits, info] = await Promise.all([
      action.supportsAccount(account, block.number),
      action.actionInfo()
    ])
    if (!fits) {
      if (config.accountImplementation) {
        if (!sameAddress(config.accountImplementation, descriptor.servedImplementation)) {
          errors.push(
            finding('action.unsupported', 'action', {
              action: actionAddress,
              account,
              supportsAccount: fits,
              implementation: config.accountImplementation,
              served: descriptor.servedImplementation
            })
          )
        }
      } else {
        warnings.push(finding('action.fit-unchecked', 'action', { action: actionAddress, account }))
      }
    }
    if (
      !descriptor.auditedActions.some((audited) => sameAddress(audited, actionAddress)) ||
      !info.supportsInterface
    ) {
      warnings.push(
        finding('action.unaudited', 'action', {
          action: actionAddress,
          probe: info.supportsInterface,
          list: descriptor.auditedActions,
          listFrom: 'descriptor'
        })
      )
    }
    warnings.push(...(await armedElsewhere(block.number)))
    return { errors, warnings }
  }

  /** The configuration a restore opened or was given, checked against the committed setup. */
  const restoreAt = async (source: ConfigurationSource, block: BlockHeader) => {
    const state = await manager.stateOf(account, actionAddress, block.number)
    if (state.setupCommitment === zeroHash) {
      throw restoreRefusal('restore.no-backup', { setup: 'none' })
    }
    let configuration: Configuration
    if ('password' in source) {
      const committed = await events.commitOf(
        {
          account,
          action: actionAddress,
          nonce: state.setupNonce,
          setupCommitment: state.setupCommitment
        },
        { from: state.setupCommittedAtBlock, to: block.number }
      )
      if (!committed) {
        throw restoreRefusal('restore.no-backup', { setup: 'standing', backup: 'none' })
      }
      try {
        const form = backupFormOf(committed.privateMetadata)
        if (form === 'empty') {
          throw restoreRefusal('restore.no-backup', { setup: 'standing', backup: 'none' })
        }
        configuration =
          form === 'clear'
            ? openClearBackup(committed.privateMetadata)
            : await openBackup(committed.privateMetadata, source.password, {
                account,
                action: actionAddress,
                setupCommitment: state.setupCommitment,
                setupNonce: state.setupNonce
              })
      } catch (thrown: unknown) {
        if (isBackupRefusal(thrown)) {
          throw restoreRefusal('restore.backup-unopened', { reason: thrown.reason })
        }
        throw thrown
      }
    } else {
      configuration = source
    }
    const recomputed = setupCommitmentOf(
      account,
      actionAddress,
      state.setupNonce,
      setupBodyOf(account, configuration)
    )
    if (recomputed !== state.setupCommitment) {
      throw restoreRefusal('restore.commitment-mismatch', {
        committed: state.setupCommitment,
        recomputed
      })
    }
    return configuration
  }

  return {
    events: notServedEvents('setup'),

    validateSetup(draft: SetupDraft): Promise<ValidationResult> {
      return withNamedRevert(async () => findingsAt(draft, await pin()))
    },

    describeSetup(draft: SetupDraft): Promise<SetupDescription> {
      return withNamedRevert(async () => {
        const block = await pin()
        const hasCode = size(await ctx.codeRead.code(account, block.number)) > 0
        const [reads, candidateKeys, actionInfo, fits, state, removed] = await Promise.all([
          methodReadsOf(draft),
          Promise.all(
            config.candidateKeys.map(async (address) => ({
              address,
              isAuthority: hasCode
                ? await action.isAuthority(account, address, block.number)
                : createdWith(address)
            }))
          ),
          action.actionInfo(),
          action.supportsAccount(account, block.number),
          manager.stateOf(account, actionAddress, block.number),
          ctx.walletReads.removedKey()
        ])
        const placed = placedCredentialsOf(account, draft)
        const passkeyDomains = placed
          .filter((p) => sameAddress(p.credential.method, descriptor.methodPasskey))
          .map((p) => {
            let rpIdHash: string | undefined
            try {
              ;[, , rpIdHash] = decodeAbiParameters(PASSKEY_CONFIG, p.credential.config)
            } catch {
              rpIdHash = undefined
            }
            return { place: p.place, rpIdHash, diesWithDomain: true, cancelByVeto: false }
          })
        return {
          rule: draft.clauses.map((clause, index) => ({
            clause: index,
            threshold: clause.threshold,
            credentials: clause.credentials.map((credential) => ({
              method: credential.method,
              label: credential.label
            }))
          })),
          wait: {
            seconds: draft.wait,
            defaultSeconds: BigInt(config.defaultWait ?? DEFAULT_WAIT)
          },
          failureDomains: draft.clauses.map((clause, index) => {
            const methods = clause.credentials.map((credential) => credential.method)
            return {
              clause: index,
              methods: distinctAddresses(methods).map((method) => ({
                method,
                count: methods.filter((other) => sameAddress(other, method)).length
              }))
            }
          }),
          parties: reads.map((r) => ({ method: r.method, trustedParties: r.parties })),
          methodStanding: reads.map((r) => ({
            method: r.method,
            shipped: descriptor.shippedMethods.some((shipped) => sameAddress(shipped, r.method)),
            declares: !undeclared(r),
            moduleInfo: r.moduleInfo,
            tier: secondary(r.method) ? 'secondary' : 'primary',
            paused: r.paused
          })),
          passkeyDomains,
          candidateKeys,
          removedKey: removed.kind === 'named' ? removed.key : 'no-creation-triple',
          privacy: {
            level: privacyLevelOf(draft.privacy),
            publicMetadata: draft.privacy.publicMetadata
          },
          backup: { form: draft.privacy.backup },
          reveals: { publicMetadata: draft.privacy.publicMetadata !== '0x' },
          cancel: { attemptActive: state.attempt.state === 'Waiting' },
          upgrade: { action: actionAddress, actionInfo, fits },
          pause: { ignoresPause: draft.ignoresPause }
        }
      })
    },

    // No simulation runs, so the prepare takes no options.
    prepareCommitSetup(
      draft: SetupDraft,
      password?: string
    ): Promise<PreparedCall | PreparedBatch> {
      return withNamedRevert(async () => {
        const block = await pin()
        const findings = await findingsAt(draft, block)
        if (findings.errors.length > 0) {
          throw validationRefusal(findings)
        }
        if (draft.privacy.backup === 'encrypted' && !password) {
          throw codedError('setup.password-missing', { backup: 'encrypted' })
        }
        const [state, authorized] = await Promise.all([
          manager.stateOf(account, actionAddress, block.number),
          action.isAuthorized(account, block.number)
        ])
        const configuration = configurationOfDraft(draft)
        const nonce = state.setupNonce + 1n
        const setupCommitment = setupCommitmentOf(
          account,
          actionAddress,
          nonce,
          setupBodyOf(account, configuration)
        )
        const privateMetadata =
          draft.privacy.backup === 'encrypted' && password
            ? await sealBackup(configuration, password, {
                account,
                action: actionAddress,
                setupCommitment,
                setupNonce: nonce
              })
            : draft.privacy.backup === 'clear'
            ? clearBackupOf(configuration)
            : EMPTY_BACKUP
        // Only Shape visible writes the public note; every other level keeps it empty.
        const publicMetadata =
          privacyLevelOf(draft.privacy) === 'shape-visible' ? draft.privacy.publicMetadata : '0x'
        const commit = accountCallOf(
          descriptor.manager,
          commitSetupData({
            action: actionAddress,
            setupCommitment,
            nonce,
            publicMetadata,
            privateMetadata
          }),
          block
        )
        if (authorized) {
          return commit
        }
        return accountBatchOf(
          [accountCallOf(account, armingData(actionAddress), block), commit],
          block
        )
      })
    },

    prepareClearSetup(): Promise<PreparedCall | PreparedBatch> {
      return Promise.reject(notServedRefusal('setup.prepareClearSetup'))
    },

    /**
     * Whether the prepared commit landed and still stands: its log is found
     * from the prepared block on, and the manager holds its nonce and its
     * commitment at the same block. A commit cleared or replaced since reads
     * as not landed. The arming is read apart.
     */
    confirmSetup(
      draft: SetupDraft,
      prepared: PreparedCall | PreparedBatch
    ): Promise<SetupConfirmation> {
      return withNamedRevert(async () => {
        const commit = storedCommitCallOf(prepared, descriptor.manager, actionAddress)
        if (!commit) {
          throw codedError('confirm.no-commit-call', { kind: prepared.kind })
        }
        const recomputed = setupCommitmentOf(
          account,
          actionAddress,
          commit.nonce,
          setupBodyOf(account, configurationOfDraft(draft))
        )
        if (recomputed !== commit.setupCommitment) {
          throw codedError('confirm.commitment-mismatch', {
            recomputed,
            carried: commit.setupCommitment
          })
        }
        // The prepared save comes back from storage: a block it does not carry reads from the deployment's.
        const preparedAt = prepared.block?.number
        const from =
          Number.isSafeInteger(preparedAt) && preparedAt >= 0 ? preparedAt : descriptor.deployedAt
        const block = await pin()
        const [found, state, isAuthorized] = await Promise.all([
          events.commitOf(
            {
              account,
              action: actionAddress,
              nonce: commit.nonce,
              setupCommitment: commit.setupCommitment
            },
            { from, to: block.number }
          ),
          manager.stateOf(account, actionAddress, block.number),
          action.isAuthorized(account, block.number)
        ])
        const stands =
          state.setupNonce === commit.nonce && state.setupCommitment === commit.setupCommitment
        const landed = !!found && stands
        return {
          landed,
          nonce: commit.nonce,
          setupCommitment: commit.setupCommitment,
          isAuthorized,
          ...(found && landed ? { position: found.at } : {})
        }
      })
    },

    setupState(): Promise<SetupState> {
      return withNamedRevert(async () => {
        const block = await pin()
        const [state, isAuthorized] = await Promise.all([
          manager.stateOf(account, actionAddress, block.number),
          action.isAuthorized(account, block.number)
        ])
        return {
          isAuthorized,
          hasSetup: state.setupCommitment !== zeroHash,
          setupCommitment: state.setupCommitment,
          setupNonce: state.setupNonce,
          setupCommittedAtBlock: state.setupCommittedAtBlock,
          attemptActive: state.attempt.state === 'Waiting',
          block
        }
      })
    },

    getSetup(source: ConfigurationSource): Promise<Configuration> {
      return withNamedRevert(async () => restoreAt(source, await pin()))
    }
  }
}
