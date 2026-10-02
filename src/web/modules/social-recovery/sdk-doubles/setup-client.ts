/**
 * The `ISetupClient` double: the two judgments, the commit and clear prepares
 * with their call-or-batch shapes, the confirmation read, the setup-side state
 * record and the restore, over the shared part doubles. Every read goes through
 * a part, so a read scripted to fail there fails here. The arming seam reaches
 * this client alone, through its constructor.
 */
import type {
  Address,
  Configuration,
  ConfigurationSource,
  Finding,
  IEventManager,
  IRecoveryActionArming,
  ISetupClient,
  PreparedBatch,
  PreparedCall,
  PrepareOptions,
  PrivacyLevel,
  SetupConfirmation,
  SetupDescription,
  SetupDraft,
  SetupState,
  ValidationResult
} from '@web/modules/social-recovery/sdk-interfaces'
import { decodeAbiParameters, zeroHash } from 'viem'

import {
  DEFAULT_MAXIMUM_WAIT,
  DEFAULT_RULE_COST_BOUND,
  DEFAULT_SHORT_WAIT_BELOW,
  DEFAULT_WAIT,
  pinBlock,
  restoreConfiguration
} from './context'
import {
  BACKUP_PADDING_SIZE,
  backupPlaintextSize,
  clearBackup,
  distinctAddresses,
  levelOfFields,
  placesOf,
  sameAddress,
  sealBackup,
  setupBodyOf,
  setupCommitmentOf
} from './encoding'
import { PASSKEY_CONFIG } from './methods'
import { composeBatch, shouldSimulate, simulationFrom, withSimulation } from './prepared'
import { codedError, finding, unansweredRead, validationRefusal } from './scripts'
import type { ClientContext, LastSetupWrite, MethodReads } from './types'

// A shift, since the build compiles `**` to Math.pow, which throws on a bigint.
// eslint-disable-next-line no-bitwise
const MAX_WAIT_FIELD = 1n << 48n

/** The widest threshold the body's `uint8` field holds. */
const THRESHOLD_FIELD = 255

export const configurationOfDraft = (draft: SetupDraft): Configuration => ({
  clauses: draft.clauses,
  wait: draft.wait,
  ignoresPause: draft.ignoresPause
})

/**
 * The privacy level a draft encodes, by the one rule the chain reads its fields
 * with (`levelOfFields`): a clear backup is public, a public note beside a
 * sealed or empty backup is shape-visible, nothing public is private.
 */
export const levelOfDraft = (draft: SetupDraft): PrivacyLevel =>
  levelOfFields(draft.privacy.publicMetadata, draft.privacy.backup === 'clear')

const distinctMethods = (draft: SetupDraft): Address[] =>
  distinctAddresses(draft.clauses.flatMap((c) => c.credentials.map((cr) => cr.method)))

/** A module whose views reverted: answered with empty values (see policy-manager.ts). */
const undeclared = (reads: MethodReads): boolean =>
  reads.moduleInfo.answered &&
  reads.moduleInfo.value.name === '' &&
  reads.moduleInfo.value.version === ''

export class SetupClientDouble implements ISetupClient {
  readonly events: IEventManager

  constructor(private readonly ctx: ClientContext, private readonly arming: IRecoveryActionArming) {
    this.events = ctx.events
  }

  private async methodReads(draft: SetupDraft): Promise<MethodReads[]> {
    const { manager } = this.ctx
    return Promise.all(
      distinctMethods(draft).map(async (method) => ({
        method,
        moduleInfo: await manager.moduleInfo(method),
        parties: await manager.trustedParties(method),
        paused: await manager.paused(method)
      }))
    )
  }

  /** The secondary tier: the identity pair, Aadhaar and zkPassport. */
  private secondary(method: Address): boolean {
    const d = this.ctx.chain.descriptor
    return sameAddress(method, d.methodAadhaar) || sameAddress(method, d.methodZkpassport)
  }

  /** The clause rows over the draft alone. */
  private clauseRows(draft: SetupDraft, errors: Finding[], warnings: Finding[]): void {
    draft.clauses.forEach((clause, index) => {
      const count = clause.credentials.length
      const methods = clause.credentials.map((c) => c.method)
      if (count === 0) {
        errors.push(finding('clause.empty', 'clause', { clause: index }))
      }
      if (clause.threshold > count) {
        errors.push(
          finding('clause.threshold-above-count', 'clause', {
            clause: index,
            threshold: clause.threshold,
            count
          })
        )
      }
      // The `uint8` field holds whole numbers from 0 to its width, nothing else.
      if (
        !Number.isInteger(clause.threshold) ||
        clause.threshold < 0 ||
        clause.threshold > THRESHOLD_FIELD
      ) {
        errors.push(
          finding('clause.threshold-too-wide', 'clause', {
            clause: index,
            threshold: clause.threshold,
            width: THRESHOLD_FIELD
          })
        )
      }
      if (clause.threshold === 0 && draft.clauses.some((c) => c.threshold > 0)) {
        warnings.push(
          finding('clause.threshold-zero', 'clause', { clause: index, othersMustBeMet: true })
        )
      }
      if (count > 0 && clause.threshold > 0 && (count === 1 || clause.threshold === count)) {
        warnings.push(
          finding('clause.single-point', 'clause', {
            clause: index,
            threshold: clause.threshold,
            count
          })
        )
      }
      if (count >= 2 && clause.threshold > 0 && methods.every((m) => sameAddress(m, methods[0]))) {
        warnings.push(
          finding('clause.shared-failure', 'clause', { clause: index, method: methods[0], count })
        )
      }
      if (count > 0 && clause.threshold > 0 && methods.every((m) => this.secondary(m))) {
        warnings.push(
          finding('clause.secondary-only', 'clause', {
            clause: index,
            methods: distinctAddresses(methods),
            threshold: clause.threshold,
            forgeableCount: count
          })
        )
      }
    })
  }

  /**
   * `rule.too-wide`: the costliest set that satisfies the rule, a
   * clause's `threshold` costliest credentials each, summed over their methods'
   * `verify` gas against the configuration's bound.
   */
  private widthRow(draft: SetupDraft): Finding | undefined {
    const { chain, config } = this.ctx
    const bound = config.ruleCostBound ?? DEFAULT_RULE_COST_BOUND
    const placed = placesOf(chain.account, configurationOfDraft(draft))
    const chosen = draft.clauses.flatMap((clause, index) =>
      placed
        .filter((p) => p.clause === index)
        .map((p) => ({
          place: p.place,
          method: p.credential.method,
          cost: chain.verifyCostOf(p.credential.method)
        }))
        .sort((a, b) => (b.cost > a.cost ? 1 : b.cost < a.cost ? -1 : 0))
        .slice(0, Math.max(0, clause.threshold))
    )
    const cost = chosen.reduce((sum, c) => sum + c.cost, 0n)
    if (cost <= bound) {
      return undefined
    }
    return finding('rule.too-wide', 'setup', {
      places: chosen.map((c) => c.place),
      methods: chosen.map((c) => ({ method: c.method, cost: c.cost })),
      cost,
      bound
    })
  }

  /**
   * `manager.already-armed`: the manager's events with the action topic
   * open, the last commit against the last clear per action, for any other
   * action whose setup still stands for this account.
   */
  private async armedElsewhere(blockNumber: number): Promise<Finding[]> {
    const { chain, events, actionAddress } = this.ctx
    const history = await events.fetch(events.accountFilter({ anyAction: true }), {
      from: chain.descriptor.deployedAt,
      to: blockNumber
    })
    const last = new Map<string, LastSetupWrite>()
    history.forEach((n) => {
      if (
        (n.kind === 'setup-committed' || n.kind === 'setup-cleared') &&
        !sameAddress(n.action, actionAddress)
      ) {
        last.set(n.action.toLowerCase(), { action: n.action, kind: n.kind, nonce: n.nonce })
      }
    })
    return [...last.values()]
      .filter((entry) => entry.kind === 'setup-committed')
      .map((entry) =>
        finding('manager.already-armed', 'account', { action: entry.action, nonce: entry.nonce })
      )
  }

  /** The setup findings over the draft and the reads, plus any appended by a script. */
  private async findings(draft: SetupDraft): Promise<ValidationResult> {
    const { chain, config, action } = this.ctx
    const block = await pinBlock(this.ctx)
    const errors: Finding[] = []
    const warnings: Finding[] = []

    if (draft.clauses.length === 0) {
      errors.push(finding('rule.empty', 'setup'))
    }
    if (draft.clauses.length > 0 && draft.clauses.every((c) => c.threshold === 0)) {
      errors.push(
        finding('rule.all-thresholds-zero', 'setup', {
          clauses: draft.clauses.map((c, clause) => ({ clause, threshold: c.threshold }))
        })
      )
    }
    this.clauseRows(draft, errors, warnings)
    const width = this.widthRow(draft)
    if (width) {
      errors.push(width)
    }

    const placed = placesOf(chain.account, configurationOfDraft(draft))
    const seen = new Map<string, number>()
    placed.forEach(({ place, credential }) => {
      const key = `${credential.method.toLowerCase()}:${credential.config.toLowerCase()}`
      if (seen.has(key)) {
        errors.push(
          finding('credential.duplicate', 'credential', { places: [seen.get(key), place] })
        )
      } else {
        seen.set(key, place)
      }
    })
    const people = new Map<string, number[]>()
    placed.forEach(({ place, credential }) => {
      const label = credential.label?.trim().toLowerCase()
      if (label) {
        people.set(label, [...(people.get(label) ?? []), place])
      }
    })
    people.forEach((places, label) => {
      if (places.length > 1) {
        warnings.push(finding('rule.repeated-person', 'setup', { label, places }))
      }
    })

    // The unsigned `uint48` field holds no negative wait either.
    if (draft.wait < 0n || BigInt(block.timestamp) + draft.wait >= MAX_WAIT_FIELD) {
      errors.push(
        finding('wait.field-width', 'setup', {
          wait: draft.wait,
          room: MAX_WAIT_FIELD - 1n - BigInt(block.timestamp)
        })
      )
    }
    const maximumWait = BigInt(config.maximumWait ?? DEFAULT_MAXIMUM_WAIT)
    if (draft.wait > maximumWait) {
      errors.push(
        finding('wait.above-maximum', 'setup', { wait: draft.wait, maximum: maximumWait })
      )
    }
    if (draft.wait === 0n) {
      warnings.push(finding('setup.wait-zero', 'setup'))
    } else if (draft.wait < BigInt(config.shortWaitBelow ?? DEFAULT_SHORT_WAIT_BELOW)) {
      warnings.push(
        finding('setup.wait-short', 'setup', {
          wait: draft.wait,
          minimum: BigInt(config.shortWaitBelow ?? DEFAULT_SHORT_WAIT_BELOW)
        })
      )
    }
    if (draft.privacy.backup === 'clear') {
      warnings.push(finding('backup.clear', 'setup'))
    }
    if (draft.privacy.backup === 'empty') {
      warnings.push(finding('backup.empty', 'setup'))
    }
    if (draft.privacy.backup !== 'empty') {
      const size = backupPlaintextSize(configurationOfDraft(draft))
      if (size > BACKUP_PADDING_SIZE) {
        errors.push(
          finding('backup.too-wide', 'setup', {
            plaintextSize: size,
            paddingSize: BACKUP_PADDING_SIZE
          })
        )
      }
    }

    // The methods a draft names: shipped, declared, stopped.
    const reads = await this.methodReads(draft)
    reads.forEach((r) => {
      // An unanswered read says nothing about the method's stop or its declaration,
      // so validation refuses rather than pass a draft over values nobody read.
      if (!r.paused.answered) {
        throw unansweredRead('manager.paused', r.method)
      }
      if (!r.moduleInfo.answered) {
        throw unansweredRead('manager.moduleInfo', r.method)
      }
      const { method } = r
      if (!chain.descriptor.shippedMethods.some((m) => sameAddress(m, method))) {
        warnings.push(
          finding('method.unshipped', 'credential', {
            method,
            probe: r.moduleInfo.value.supportsInterface,
            list: chain.descriptor.shippedMethods,
            listFrom: 'descriptor'
          })
        )
      }
      if (undeclared(r)) {
        warnings.push(finding('method.no-declaration', 'credential', { method }))
      }
      if (r.paused.value) {
        warnings.push(
          finding('method.stopped', 'credential', { method, ignoresPause: draft.ignoresPause })
        )
      }
    })

    // The action check: the fit check read three ways, and the audit list.
    const [fits, info] = await Promise.all([action.supportsAccount(), action.actionInfo()])
    if (!fits) {
      if (config.accountImplementation) {
        if (!sameAddress(config.accountImplementation, chain.descriptor.servedImplementation)) {
          errors.push(
            finding('action.unsupported', 'action', {
              action: this.ctx.actionAddress,
              account: chain.account,
              supportsAccount: fits,
              implementation: config.accountImplementation,
              served: chain.descriptor.servedImplementation
            })
          )
        }
      } else {
        warnings.push(
          finding('action.fit-unchecked', 'action', {
            action: this.ctx.actionAddress,
            account: chain.account
          })
        )
      }
    }
    if (
      !chain.descriptor.auditedActions.some((a) => sameAddress(a, this.ctx.actionAddress)) ||
      !info.supportsInterface
    ) {
      warnings.push(
        finding('action.unaudited', 'action', {
          action: this.ctx.actionAddress,
          probe: info.supportsInterface,
          list: chain.descriptor.auditedActions,
          listFrom: 'descriptor'
        })
      )
    }
    warnings.push(...(await this.armedElsewhere(block.number)))

    const appended = chain.appendedFindings('setup.validateSetup')
    return {
      errors: [...errors, ...appended.errors],
      warnings: [...warnings, ...appended.warnings]
    }
  }

  async validateSetup(draft: SetupDraft): Promise<ValidationResult> {
    this.ctx.chain.guard('setup.validateSetup')
    return this.findings(draft)
  }

  /**
   * The interfaces type most values of a `SetupDescription` as `unknown`; the
   * shapes below are the doubles' own, and a screen must not rely on them.
   */
  async describeSetup(draft: SetupDraft): Promise<SetupDescription> {
    const { chain, config, manager, action } = this.ctx
    chain.guard('setup.describeSetup')
    const reads = await this.methodReads(draft)
    const candidateKeys = await Promise.all(
      config.candidateKeys.map(async (address) => ({
        address,
        isAuthority: await action.isAuthority(address)
      }))
    )
    const [actionInfo, fits, state] = await Promise.all([
      action.actionInfo(),
      action.supportsAccount(),
      manager.stateOf()
    ])
    const removed = chain.removedKeyReading(!!config.creation)
    const placed = placesOf(chain.account, configurationOfDraft(draft))
    const passkeyDomains = placed
      .filter((p) => sameAddress(p.credential.method, chain.descriptor.methodPasskey))
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
      rule: draft.clauses.map((c, clause) => ({
        clause,
        threshold: c.threshold,
        credentials: c.credentials.map((cr) => ({ method: cr.method, label: cr.label }))
      })),
      wait: { seconds: draft.wait, defaultSeconds: BigInt(config.defaultWait ?? DEFAULT_WAIT) },
      failureDomains: draft.clauses.map((c, clause) => {
        const methods = c.credentials.map((cr) => cr.method)
        const distinct = distinctAddresses(methods)
        return {
          clause,
          methods: distinct.map((method) => ({
            method,
            count: methods.filter((m) => sameAddress(m, method)).length
          }))
        }
      }),
      parties: reads.map((r) => ({ method: r.method, trustedParties: r.parties })),
      methodStanding: reads.map((r) => ({
        method: r.method,
        shipped: chain.descriptor.shippedMethods.some((m) => sameAddress(m, r.method)),
        declares: !undeclared(r),
        moduleInfo: r.moduleInfo,
        tier: this.secondary(r.method) ? 'secondary' : 'primary',
        paused: r.paused
      })),
      passkeyDomains,
      candidateKeys,
      // No value exists for a replay that names no key or several; see `recoveryState`.
      removedKey: removed.kind === 'named' ? removed.key : 'no-creation-triple',
      privacy: { level: levelOfDraft(draft), publicMetadata: draft.privacy.publicMetadata },
      backup: { form: draft.privacy.backup },
      reveals: { publicMetadata: draft.privacy.publicMetadata !== '0x' },
      cancel: { attemptActive: state.attempt.state === 'Waiting' },
      upgrade: { action: this.ctx.actionAddress, actionInfo, fits },
      pause: { ignoresPause: draft.ignoresPause }
    }
  }

  async prepareCommitSetup(
    draft: SetupDraft,
    password?: string,
    options?: PrepareOptions
  ): Promise<PreparedCall | PreparedBatch> {
    const { chain, manager, action, actionAddress, config } = this.ctx
    chain.guardRefusal('setup.prepareCommitSetup')
    const block = await pinBlock(this.ctx)
    const findings = await this.findings(draft)
    if (findings.errors.length > 0) {
      throw validationRefusal(findings)
    }
    if (draft.privacy.backup === 'encrypted' && !password) {
      throw codedError('setup.password-missing', { backup: 'encrypted' })
    }
    const configuration = configurationOfDraft(draft)
    const privateMetadata =
      draft.privacy.backup === 'encrypted'
        ? sealBackup(configuration, password as string)
        : draft.privacy.backup === 'clear'
        ? clearBackup(configuration)
        : '0x'
    const state = await manager.stateOf()
    const nonce = state.setupNonce + 1n
    const setupBody = setupBodyOf(chain.account, configuration)
    const setupCommitment = setupCommitmentOf(chain.account, actionAddress, nonce, setupBody)
    const commit = await manager.prepareCommitSetup(
      actionAddress,
      setupCommitment,
      nonce,
      draft.privacy.publicMetadata,
      privateMetadata
    )
    chain.registerEffect(commit.data, {
      kind: 'commit',
      setupCommitment,
      nonce,
      publicMetadata: draft.privacy.publicMetadata,
      privateMetadata,
      setupBody,
      configuration
    })
    const authorized = await action.isAuthorized()
    const simulate = shouldSimulate(options, config.simulate)
    const failure = chain.simulationFailure('setup.prepareCommitSetup')
    const from = simulationFrom(chain, 'account', options)
    if (authorized) {
      const call = { ...commit, block: { number: block.number, hash: block.hash } }
      return simulate ? withSimulation(call, from, failure) : call
    }
    const arming = await this.arming.armingCall()
    const calls = [arming, commit].map((c) => ({
      ...c,
      block: { number: block.number, hash: block.hash }
    }))
    return composeBatch(
      simulate
        ? calls.map((c, i) => withSimulation(c, from, i === 1 ? failure : undefined))
        : calls,
      block
    )
  }

  async prepareClearSetup(options?: PrepareOptions): Promise<PreparedCall | PreparedBatch> {
    const { chain, manager, action, actionAddress, config } = this.ctx
    chain.guardRefusal('setup.prepareClearSetup')
    const block = await pinBlock(this.ctx)
    const [state, authorized] = await Promise.all([manager.stateOf(), action.isAuthorized()])
    const hasSetup = state.setupCommitment !== zeroHash
    const simulate = shouldSimulate(options, config.simulate)
    const failure = chain.simulationFailure('setup.prepareClearSetup')
    const from = simulationFrom(chain, 'account', options)
    const pin = (c: PreparedCall, error = failure): PreparedCall => {
      const pinned = { ...c, block: { number: block.number, hash: block.hash } }
      return simulate ? withSimulation(pinned, from, error) : pinned
    }
    if (hasSetup && authorized) {
      const clear = await manager.prepareClearSetup(actionAddress)
      const disarm = await action.disarmingCall()
      return composeBatch([pin(clear), pin(disarm, undefined)], block)
    }
    if (hasSetup) {
      return pin(await manager.prepareClearSetup(actionAddress))
    }
    return pin(await action.disarmingCall())
  }

  async confirmSetup(
    draft: SetupDraft,
    prepared: PreparedCall | PreparedBatch
  ): Promise<SetupConfirmation> {
    const { chain, events, action, actionAddress } = this.ctx
    chain.guardRefusal('setup.confirmSetup')
    const calls = prepared.kind === 'batch' ? prepared.calls : [prepared]
    const commit = calls.map((c) => chain.effectOf(c.data)).find((e) => e?.kind === 'commit')
    if (!commit || commit.kind !== 'commit') {
      throw codedError('confirm.no-commit-call', { kind: prepared.kind })
    }
    const recomputed = setupCommitmentOf(
      chain.account,
      actionAddress,
      commit.nonce,
      setupBodyOf(chain.account, configurationOfDraft(draft))
    )
    if (recomputed !== commit.setupCommitment) {
      throw codedError('confirm.commitment-mismatch', {
        recomputed,
        carried: commit.setupCommitment
      })
    }
    const block = await pinBlock(this.ctx)
    const found = (
      await events.fetch(events.accountFilter(), { from: prepared.block.number, to: block.number })
    ).find(
      (n) =>
        n.kind === 'setup-committed' &&
        n.nonce === commit.nonce &&
        n.setupCommitment === commit.setupCommitment
    )
    const isAuthorized = await action.isAuthorized()
    return {
      landed: !!found,
      nonce: commit.nonce,
      setupCommitment: commit.setupCommitment,
      isAuthorized,
      ...(found ? { position: found.at } : {})
    }
  }

  async setupState(): Promise<SetupState> {
    const { chain, manager, action } = this.ctx
    chain.guard('setup.setupState')
    const block = await pinBlock(this.ctx)
    const [state, isAuthorized] = await Promise.all([manager.stateOf(), action.isAuthorized()])
    return {
      isAuthorized,
      hasSetup: state.setupCommitment !== zeroHash,
      setupCommitment: state.setupCommitment,
      setupNonce: state.setupNonce,
      setupCommittedAtBlock: state.setupCommittedAtBlock,
      attemptActive: state.attempt.state === 'Waiting',
      block
    }
  }

  async getSetup(source: ConfigurationSource): Promise<Configuration> {
    this.ctx.chain.guardRefusal('setup.getSetup')
    return restoreConfiguration(this.ctx, source)
  }
}
