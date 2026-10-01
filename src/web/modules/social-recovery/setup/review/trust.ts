/**
 * The trust list as pure functions over the path, the enrollments and the
 * module reads: one contract row per method, the headings of the path rows
 * that use it, and the node the wallet reads through.
 */
import { zeroAddress } from 'viem'

import type { Address, Clause, Credential } from '@web/modules/social-recovery/sdk-interfaces'
import { sameAddress } from '@web/modules/social-recovery/shared/client'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import { isEmptySlot } from '@web/modules/social-recovery/shared/records/slots'

import { enrollmentOf, guardianAddressOf, kindOf } from './lead'
import { LIGHT_CLIENT_PROVIDERS, TRUST_READ_NAMES } from './constants'
import type {
  MethodReads,
  NodeKind,
  ProviderKind,
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

const nonZero = (address: Address): Address | undefined =>
  sameAddress(address, zeroAddress) ? undefined : address

/**
 * What the list says about one method from its two reads. A read still running
 * leaves the row pending; a read that did not answer marks it unavailable. A
 * module the deployment does not ship, or one that does not answer to the
 * method interface, is a third-party module.
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
  const { trustedParties, moduleInfo } = reads
  if (!trustedParties?.answered || !moduleInfo?.answered) {
    return { status: 'pending' }
  }
  const shipped = input.shippedMethods.some((address) => sameAddress(address, method))
  if (!shipped || !moduleInfo.value.supportsInterface) {
    return { status: 'third-party' }
  }
  const admin = nonZero(trustedParties.value.admin)
  return {
    status: 'declared',
    admin,
    pendingAdmin: nonZero(trustedParties.value.pendingAdmin),
    recoverAlone: !!admin && aloneSatisfiesRule(input.clauses, method, input.addressBook),
    passportRenewal: sameAddress(method, input.addressBook.methods.zkpassport)
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

/** The node by kind: a light client with its prover, or a plain node where the kind is absent. */
export const nodeKindOf = (providerKind: ProviderKind | undefined): NodeKind =>
  LIGHT_CLIENT_PROVIDERS.some((kind) => kind === providerKind) ? 'light-client' : 'plain'
