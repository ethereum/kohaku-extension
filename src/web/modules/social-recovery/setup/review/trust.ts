/**
 * The trust list as pure functions over the path, the enrollments and the
 * module reads: one contract row per method, the headings of the path rows
 * that use it, the security stop block's rows, and the node the wallet reads
 * through.
 */
import { zeroAddress } from 'viem'

import type {
  Address,
  Clause,
  Credential,
  TrustedParties
} from '@web/modules/social-recovery/sdk-interfaces'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import { isEmptySlot } from '@web/modules/social-recovery/shared/records/slots'

import { enrollmentOf, guardianAddressOf, isRequiredRow, kindOf } from './lead'
import { LIGHT_CLIENT_PROVIDERS, TRUST_READ_NAMES } from './constants'
import type {
  AdminDeclaration,
  MethodReads,
  NodeKind,
  ProviderKind,
  StopDeclaration,
  StopRow,
  TrustContract,
  TrustHeading,
  TrustRow,
  TrustRowsInput
} from './types'

/**
 * The method contract a credential uses: an enrolled credential's own method,
 * or for an empty slot the address book's method of the kind it waits for.
 */
export const methodOfCredential = (
  credential: Credential,
  addressBook: AddressBook
): Address | undefined => {
  if (!isEmptySlot(credential)) {
    return credential.method
  }
  const kind = kindOf(credential, addressBook)
  return kind ? addressBook.methods[kind] : undefined
}

/** Every method contract of the path once, in the order the path first names it. */
export const methodsOf = (clauses: readonly Clause[], addressBook: AddressBook): Address[] =>
  clauses
    .flatMap(({ credentials }) => credentials)
    .map((credential) => methodOfCredential(credential, addressBook))
    .filter((method): method is Address => method !== undefined)
    .filter((method, index, all) => all.findIndex((held) => sameAddress(held, method)) === index)

/** The key a method's reads are held under. */
export const readKeyOf = (method: Address): string => method.toLowerCase()

/**
 * Whether one method alone satisfies the whole rule: every clause that holds a
 * credential holds at least its threshold of credentials of that method.
 */
export const aloneSatisfiesRule = (
  clauses: readonly Clause[],
  method: Address,
  addressBook: AddressBook
): boolean => {
  const held = clauses.filter((clause) => clause.credentials.length > 0)
  return (
    held.length > 0 &&
    held.every(
      (clause) =>
        clause.credentials.filter((credential) =>
          sameAddress(methodOfCredential(credential, addressBook), method)
        ).length >= clause.threshold
    )
  )
}

/**
 * Whether every clause that holds a credential is at threshold one with no
 * required row beside another clause: a lone row, or groups of any one.
 */
const everyClauseAtOne = (clauses: readonly Clause[]): boolean => {
  const held = clauses.filter((clause) => clause.credentials.length > 0)
  return (
    held.every(({ threshold }) => threshold === 1) &&
    (held.length === 1 || !held.some(isRequiredRow))
  )
}

const nonZero = (address: Address): Address | undefined =>
  sameAddress(address, zeroAddress) ? undefined : address

/** What a method's declaration says about its admin, and whether that admin could recover alone. */
const adminDeclarationOf = (
  method: Address,
  trustedParties: TrustedParties,
  input: TrustRowsInput
): AdminDeclaration => {
  const admin = nonZero(trustedParties.admin)
  const recoverAlone = !!admin && aloneSatisfiesRule(input.clauses, method, input.addressBook)
  return {
    admin,
    pendingAdmin: nonZero(trustedParties.pendingAdmin),
    recoverAlone,
    aloneAtThresholdOne: recoverAlone && everyClauseAtOne(input.clauses)
  }
}

/** What a method's declaration and its `paused` read say about stopping it. */
const stopDeclarationOf = (trustedParties: TrustedParties, paused: boolean): StopDeclaration => {
  const pauseHolder = nonZero(trustedParties.pauseHolder)
  const pendingPauseHolder = nonZero(trustedParties.pendingPauseHolder)
  return {
    paused,
    ...(pauseHolder ? { pauseHolder } : {}),
    ...(pendingPauseHolder ? { pendingPauseHolder } : {})
  }
}

/**
 * What the list says about one method from its three reads. A read still
 * running leaves the row pending; a read that did not answer marks it
 * unavailable. A module the deployment does not ship, or one that does not
 * answer to the method interface, is a third-party module; one that answers
 * to it keeps its own declaration, read by the same rule as a shipped method.
 */
const contractOf = (
  method: Address,
  reads: MethodReads | undefined,
  input: TrustRowsInput
): TrustContract => {
  if (!reads || TRUST_READ_NAMES.some((name) => reads[name] === undefined)) {
    return { status: 'pending' }
  }
  const unanswered = TRUST_READ_NAMES.filter((name) => reads[name]?.answered === false)
  if (unanswered.length > 0) {
    return { status: 'unavailable', unanswered }
  }
  const { trustedParties, moduleInfo, paused } = reads
  if (!trustedParties?.answered || !moduleInfo?.answered || !paused?.answered) {
    return { status: 'pending' }
  }
  if (!moduleInfo.value.supportsInterface) {
    return { status: 'third-party' }
  }
  const admin = adminDeclarationOf(method, trustedParties.value, input)
  const stop = stopDeclarationOf(trustedParties.value, paused.value)
  const shipped = input.shippedMethods.some((address) => sameAddress(address, method))
  if (!shipped) {
    return { status: 'third-party', declaration: { ...admin, ...stop } }
  }
  return {
    status: 'declared',
    ...admin,
    passportRenewal: sameAddress(method, input.addressBook.methods.zkpassport),
    ...stop
  }
}

/**
 * The trust list's contract rows: one per method of the path however many path
 * rows use it, each under the headings of the credentials that use it, with
 * the count line above several guardian headings.
 */
export const trustRowsOf = (input: TrustRowsInput): TrustRow[] => {
  const credentials = input.clauses.flatMap(({ credentials: held }) => held)
  return methodsOf(input.clauses, input.addressBook).map((method) => {
    const headings: TrustHeading[] = credentials
      .filter((credential) =>
        sameAddress(methodOfCredential(credential, input.addressBook), method)
      )
      .map((credential) => {
        const kind = kindOf(credential, input.addressBook)
        const guardian =
          kind === 'ecdsa' && !isEmptySlot(credential) ? guardianAddressOf(credential) : undefined
        const enrollment = enrollmentOf(credential, input.enrollments)
        return {
          credential,
          kind,
          ...(guardian ? { guardian } : {}),
          ...(enrollment?.backup ? { backup: enrollment.backup } : {}),
          tested: enrollment?.test === 'passed'
        }
      })
    const kind = headings[0]?.kind
    const guardianHeadings = headings.filter((heading) => heading.kind === 'ecdsa')
    return {
      method,
      kind,
      headings,
      ...(guardianHeadings.length > 1
        ? {
            guardians: {
              count: guardianHeadings.length,
              tested: guardianHeadings.filter((heading) => heading.tested).length
            }
          }
        : {}),
      contract: contractOf(method, input.reads[readKeyOf(method)], input)
    }
  })
}

/** Whether every read of the trust list answered, the half of the save gate this list holds. */
export const trustReadsComplete = (rows: readonly TrustRow[]): boolean =>
  rows.length > 0 &&
  rows.every(({ contract }) => contract.status !== 'pending' && contract.status !== 'unavailable')

/** Whether two addresses name the same party. */
const sameParty = (one: Address | undefined, other: Address | undefined): one is Address =>
  !!one && !!other && sameAddress(one, other)

/**
 * The security stop block's rows: one per method of the path in the trust
 * list's order, each from that method's own declaration. A module with no
 * declaration takes no row.
 */
export const stopRowsOf = (rows: readonly TrustRow[]): StopRow[] =>
  rows.flatMap(({ method, kind, contract }): StopRow[] => {
    if (contract.status === 'pending') {
      return [{ method, kind, stop: { status: 'pending' } }]
    }
    if (contract.status === 'unavailable') {
      return [{ method, kind, stop: { status: 'unavailable' } }]
    }
    const declared = contract.status === 'declared' ? contract : contract.declaration
    if (!declared) {
      return []
    }
    const { admin, paused, pauseHolder, pendingPauseHolder } = declared
    return [
      {
        method,
        kind,
        stop: {
          status: 'declared',
          paused,
          ...(pauseHolder ? { pauseHolder } : {}),
          ...(pendingPauseHolder ? { pendingPauseHolder } : {}),
          ...(sameParty(pauseHolder, admin) ? { bothRoles: pauseHolder } : {})
        }
      }
    ]
  })

/** The node by kind: a light client with its prover, or a plain node where the kind is absent. */
export const nodeKindOf = (providerKind: ProviderKind | undefined): NodeKind =>
  LIGHT_CLIENT_PROVIDERS.some((kind) => kind === providerKind) ? 'light-client' : 'plain'
