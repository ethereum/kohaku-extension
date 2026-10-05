/**
 * The setup findings a draft decides alone, given the account, the
 * deployment's methods, the timing and cost numbers and the timestamp of the
 * block the wait is judged at: the rule's and the clauses' shape, the width of
 * the costliest set that satisfies the rule, repeated credentials and people,
 * the wait's field and bounds, and the backup's form and width. No read.
 */
import { maxUint48, maxUint8 } from 'viem'

import {
  configurationOfDraft,
  DEFAULT_MAXIMUM_WAIT,
  DEFAULT_RULE_COST_BOUND,
  DEFAULT_SHORT_WAIT_BELOW,
  finding
} from '@web/modules/social-recovery/sdk-doubles'
import { distinctAddresses } from '@web/modules/social-recovery/sdk-doubles/encoding'
import type {
  Address,
  Finding,
  SetupDraft,
  ValidationResult
} from '@web/modules/social-recovery/sdk-interfaces'

import { sameAddress } from '../../addresses'
import { BACKUP_PADDED_SIZE, backupPlaintextSizeOf } from '../backup'
import type { BackupRefusal } from '../backup'
import { placedCredentialsOf } from '../formats'
import type { CostedPlace, DeploymentMethods, DraftFindingsInput } from './types'

/** The widest threshold the body's `uint8` field holds. */
const THRESHOLD_FIELD = Number(maxUint8)

/**
 * The `verify` gas each method is priced at for the rule's width. Placeholder
 * costs until each deployed method's verify gas is measured; a method the
 * deployment does not name is priced at the identity methods' cost.
 */
export const VERIFY_COST_STAND_INS = {
  ecdsa: 10_000n,
  passkey: 400_000n,
  aadhaar: 2_000_000n,
  zkpassport: 2_000_000n,
  unknown: 2_000_000n
} as const

/** The verify cost a method is priced at (`VERIFY_COST_STAND_INS`). */
export const verifyCostOf = (method: Address, methods: DeploymentMethods): bigint => {
  if (sameAddress(method, methods.methodEcdsa)) {
    return VERIFY_COST_STAND_INS.ecdsa
  }
  if (sameAddress(method, methods.methodPasskey)) {
    return VERIFY_COST_STAND_INS.passkey
  }
  if (sameAddress(method, methods.methodAadhaar)) {
    return VERIFY_COST_STAND_INS.aadhaar
  }
  if (sameAddress(method, methods.methodZkpassport)) {
    return VERIFY_COST_STAND_INS.zkpassport
  }
  return VERIFY_COST_STAND_INS.unknown
}

/** The secondary tier: the identity pair, Aadhaar and zkPassport. */
const isSecondary = (method: Address, methods: DeploymentMethods): boolean =>
  sameAddress(method, methods.methodAadhaar) || sameAddress(method, methods.methodZkpassport)

export const isBackupRefusal = (value: unknown): value is BackupRefusal =>
  value instanceof Error && value.name === 'BackupRefusal'

/** The rows of each clause, over the draft alone. */
const clauseRows = (
  draft: SetupDraft,
  methods: DeploymentMethods,
  errors: Finding[],
  warnings: Finding[]
): void => {
  draft.clauses.forEach((clause, index) => {
    const count = clause.credentials.length
    const clauseMethods = clause.credentials.map((credential) => credential.method)
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
    if (clause.threshold === 0 && draft.clauses.some((other) => other.threshold > 0)) {
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
    if (
      count >= 2 &&
      clause.threshold > 0 &&
      clauseMethods.every((method) => sameAddress(method, clauseMethods[0]))
    ) {
      warnings.push(
        finding('clause.shared-failure', 'clause', {
          clause: index,
          method: clauseMethods[0],
          count
        })
      )
    }
    if (
      count > 0 &&
      clause.threshold > 0 &&
      clauseMethods.every((method) => isSecondary(method, methods))
    ) {
      warnings.push(
        finding('clause.secondary-only', 'clause', {
          clause: index,
          methods: distinctAddresses(clauseMethods),
          threshold: clause.threshold,
          forgeableCount: count
        })
      )
    }
  })
}

/**
 * `rule.too-wide`: the costliest set that satisfies the rule, each clause's
 * `threshold` costliest credentials, summed over their methods' verify cost
 * against the configuration's bound.
 */
const widthRow = (draft: SetupDraft, input: DraftFindingsInput): Finding | undefined => {
  const bound = input.config.ruleCostBound ?? DEFAULT_RULE_COST_BOUND
  const placed = placedCredentialsOf(input.account, draft)
  const chosen = draft.clauses.flatMap((clause, index) =>
    placed
      .filter((p) => p.clause === index)
      .map(
        (p): CostedPlace => ({
          place: p.place,
          method: p.credential.method,
          cost: verifyCostOf(p.credential.method, input.descriptor)
        })
      )
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
 * `backup.too-wide` for a sealed backup: a plaintext wider than the one size
 * every sealed backup is padded to, or a value no field of the plaintext
 * holds. A clear backup is not padded and has no width to exceed.
 */
const backupWidthRow = (draft: SetupDraft): Finding | undefined => {
  try {
    const plaintextSize = backupPlaintextSizeOf(configurationOfDraft(draft))
    if (plaintextSize <= BACKUP_PADDED_SIZE) {
      return undefined
    }
    return finding('backup.too-wide', 'setup', { plaintextSize, paddingSize: BACKUP_PADDED_SIZE })
  } catch (thrown: unknown) {
    if (isBackupRefusal(thrown) && thrown.reason === 'field-width') {
      return finding('backup.too-wide', 'setup', {
        paddingSize: BACKUP_PADDED_SIZE,
        fieldWidth: true
      })
    }
    throw thrown
  }
}

/** The setup findings over the draft alone. */
export const draftFindingsOf = (draft: SetupDraft, input: DraftFindingsInput): ValidationResult => {
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
  clauseRows(draft, input.descriptor, errors, warnings)
  const width = widthRow(draft, input)
  if (width) {
    errors.push(width)
  }

  const placed = placedCredentialsOf(input.account, draft)
  const seen = new Map<string, number>()
  placed.forEach(({ place, credential }) => {
    const key = `${credential.method.toLowerCase()}:${credential.config.toLowerCase()}`
    const first = seen.get(key)
    if (first === undefined) {
      seen.set(key, place)
    } else {
      errors.push(finding('credential.duplicate', 'credential', { places: [first, place] }))
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

  // The unsigned `uint48` field holds no negative wait, and the wait's end must fit it too.
  const timestamp = BigInt(input.blockTimestamp)
  if (draft.wait < 0n || timestamp + draft.wait > maxUint48) {
    errors.push(
      finding('wait.field-width', 'setup', { wait: draft.wait, room: maxUint48 - timestamp })
    )
  }
  const maximumWait = BigInt(input.config.maximumWait ?? DEFAULT_MAXIMUM_WAIT)
  if (draft.wait > maximumWait) {
    errors.push(finding('wait.above-maximum', 'setup', { wait: draft.wait, maximum: maximumWait }))
  }
  const shortWaitBelow = BigInt(input.config.shortWaitBelow ?? DEFAULT_SHORT_WAIT_BELOW)
  if (draft.wait === 0n) {
    warnings.push(finding('setup.wait-zero', 'setup'))
  } else if (draft.wait < shortWaitBelow) {
    warnings.push(
      finding('setup.wait-short', 'setup', { wait: draft.wait, minimum: shortWaitBelow })
    )
  }

  if (draft.privacy.backup === 'clear') {
    warnings.push(finding('backup.clear', 'setup'))
  }
  if (draft.privacy.backup === 'empty') {
    warnings.push(finding('backup.empty', 'setup'))
  }
  // A wait or a threshold its field does not hold is refused above; the
  // backup's own field check would only repeat it.
  const fieldRefused = errors.some(
    (error) => error.code === 'wait.field-width' || error.code === 'clause.threshold-too-wide'
  )
  if (draft.privacy.backup === 'encrypted' && !fieldRefused) {
    const backupWidth = backupWidthRow(draft)
    if (backupWidth) {
      errors.push(backupWidth)
    }
  }

  return { errors, warnings }
}
