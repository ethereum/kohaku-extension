/**
 * The guardian row's logic: the field's value read as an address or a name,
 * the advisory checks, the enrollment through the wallet method, and the
 * access test, whose check runs here and never through the orchestrator.
 *
 * Every check is advisory: none of them holds the enrollment or the save.
 */
import { decodeAbiParameters, hashTypedData, isAddress, isHex, verifyTypedData } from 'viem'

import type { Address, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import {
  dismissed,
  failed,
  notSupported,
  outcomeOfThrown,
  passed,
  unavailable
} from '@web/modules/social-recovery/shared/ceremony'
import type { CeremonyDevice } from '@web/modules/social-recovery/shared/ceremony'
import {
  isSignFlowFailure,
  sameAddress,
  typedMessageOf
} from '@web/modules/social-recovery/shared/client'

import { keyTestToSignOf } from './testRequest'
import type {
  ChallengeFile,
  CheckLine,
  GuardianChain,
  GuardianChecks,
  GuardianTarget,
  GuardianTestOutcome,
  HeldKey,
  KeyTestTypedData
} from './types'

const GUARDIAN = 'socialRecovery.enroll.guardian'

/**
 * The field's value: an address, or anything else read as a name. An address
 * that fails its checksum is enrolled lowercased, since the wallet method
 * refuses a mixed-case address with a wrong checksum.
 */
export const guardianTargetOf = (value: string): GuardianTarget => {
  const trimmed = value.trim()
  if (trimmed === '') {
    return { kind: 'empty' }
  }
  if (!isAddress(trimmed, { strict: false })) {
    return { kind: 'name', name: trimmed }
  }
  const lowercase = trimmed.toLowerCase() as Address
  return isAddress(trimmed, { strict: true })
    ? { kind: 'address', address: trimmed, checksum: 'ok' }
    : { kind: 'address', address: lowercase, checksum: 'failed' }
}

/** The code check: no code, or a contract at the address. */
export const codeCheckOf = (code: Hex): 'none' | 'contract' => (code === '0x' ? 'none' : 'contract')

/**
 * The same-seed check over the keys the wallet derived: a key at the address
 * derived from a seed the wallet holds. An address at an index the wallet
 * never derived is not detected.
 */
export const seedCheckOf = (keys: readonly HeldKey[], address: Address): 'same' | 'not' =>
  keys.some((key) => sameAddress(key.addr, address) && !!key.fromSeedId) ? 'same' : 'not'

/** The key the wallet holds at the address, which signs the test on this device. */
export const heldKeyOf = (keys: readonly HeldKey[], address: Address): HeldKey | undefined =>
  keys.find((key) => sameAddress(key.addr, address))

/** The checks block's lines, in the order the row shows them. */
export const checkLinesOf = (checks: GuardianChecks): CheckLine[] => {
  const lines: CheckLine[] = []
  if (checks.checksum) {
    lines.push({ key: `${GUARDIAN}.${checks.checksum === 'ok' ? 'checksumOk' : 'checksumFailed'}` })
  }
  if (checks.name?.status === 'resolved') {
    lines.push({ key: `${GUARDIAN}.nameResolves`, values: { name: checks.name.name } })
  } else if (checks.name?.status === 'unresolved') {
    lines.push({ key: `${GUARDIAN}.nameUnresolved` })
  }
  if (checks.code) {
    lines.push({ key: `${GUARDIAN}.${checks.code === 'none' ? 'noCode' : 'smartAccountDetected'}` })
  }
  if (checks.seed) {
    lines.push({ key: `${GUARDIAN}.${checks.seed === 'same' ? 'sameSeed' : 'notSameSeed'}` })
  }
  return lines
}

/**
 * The device the wallet method enrolls with: its material is the address the
 * holder gave, so the device hands the method's input back as it is. It signs
 * nothing, since the guardian's test signs outside the ceremony.
 */
export const guardianDevice: CeremonyDevice = {
  enroll: async (input) => ({ ok: true, material: input }),
  sign: async () => ({ ok: false, stop: notSupported('no-implementation') })
}

/** The address a guardian's stored config names, or undefined where it does not decode. */
export const guardianAddressOf = (config: Hex): Address | undefined => {
  try {
    const [address] = decodeAbiParameters([{ type: 'address' }], config)
    return address
  } catch {
    return undefined
  }
}

/**
 * The key test as JSON, as `eth_signTypedData_v4` takes it: the domain type
 * spelled out, the same types the local check hashes, so a signer that adds
 * its own domain type signs the same digest. Each bigint is a decimal string.
 */
export const challengeTextOf = (keyTest: KeyTestTypedData): string => {
  const { domain, types, primaryType, message } = typedMessageOf(keyTestToSignOf(keyTest))
  return JSON.stringify({ domain, types, primaryType, message }, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value
  )
}

/** The key test as the file the offline block saves. */
export const challengeFileOf = (keyTest: KeyTestTypedData): ChallengeFile => ({
  name: 'kohaku-test-challenge.json',
  text: challengeTextOf(keyTest),
  type: 'application/json'
})

/** A pasted signature: hex bytes, or null for anything else. */
export const signatureOf = (text: string): Hex | null => {
  const trimmed = text.trim()
  return isHex(trimmed, { strict: true }) && trimmed.length > 2 && trimmed.length % 2 === 0
    ? trimmed
    : null
}

/**
 * The local check of a guardian's signature over the key test: a signature by
 * the address over the same typed data passes. Where it does not, the
 * address's own EIP-1271 answer over the typed data's digest decides; an
 * address with no code answers nothing, which fails as no match. Without a
 * provider, or with a read the chain did not answer, the test is unavailable.
 * A signature checked after the key test's deadline fails, whoever signed it.
 */
export const checkGuardianSignature = async (input: {
  keyTest: KeyTestTypedData
  signature: Hex
  address: Address
  chain: GuardianChain | null
  /** Milliseconds since epoch. */
  now: number
}): Promise<GuardianTestOutcome> => {
  if (input.keyTest.message.validUntil < BigInt(Math.floor(input.now / 1000))) {
    return failed('material-rejected', 'expired')
  }
  // A signature that does not parse recovers to no address.
  const signed = await verifyTypedData({
    ...input.keyTest,
    address: input.address,
    signature: input.signature
  }).catch(() => false)
  if (signed) {
    return passed({ signature: input.signature })
  }
  if (!input.chain) {
    return unavailable('service-unanswered')
  }
  try {
    const valid = await input.chain.isValidSignature(
      input.address,
      hashTypedData(input.keyTest),
      input.signature
    )
    return valid ? passed({ signature: input.signature }) : failed('check-rejected')
  } catch {
    return unavailable('service-unanswered')
  }
}

/**
 * A signing request that returned no signature, as a test outcome: the holder
 * refused it or let it time out, a dismissal that leaves the verdict as it was;
 * a signature that does not recover to the key fails as no match.
 */
export const outcomeOfSignError = (error: unknown): GuardianTestOutcome => {
  if (isSignFlowFailure(error)) {
    return error.reason === 'refused' || error.reason === 'timeout'
      ? dismissed('cancelled', error.reason)
      : failed('check-rejected', error.reason)
  }
  return outcomeOfThrown(error)
}
