/**
 * The access test's challenges, each valid for the recovery request window and
 * carrying a fresh salt, so no two tests sign the same challenge.
 *
 * A passkey signs an approval request for place zero of attempt zero under
 * setup number zero, with no handover and no payment, which the ceremony tab
 * checks through its method.
 *
 * A guardian's key signs typed data of its own, under a domain with no
 * verifying contract and a primary type no approval uses, so a test signature
 * never stands as an approval.
 */
import { bytesToHex, zeroAddress, zeroHash } from 'viem'

import type { ApproverRequest } from '@web/modules/social-recovery/sdk-interfaces'
import { REQUEST_WINDOW_SECONDS } from '@web/modules/social-recovery/shared/client'
import type { TypedDataToSign } from '@web/modules/social-recovery/shared/client'

import type { KeyTestInput, KeyTestTypedData, TestRequestInput } from './types'

const validUntilOf = (now: number): number => Math.floor(now / 1000) + REQUEST_WINDOW_SECONDS

export const testRequestOf = ({
  descriptor,
  chainId,
  account,
  method,
  config,
  now,
  randomBytes
}: TestRequestInput): ApproverRequest => ({
  kind: 'recovery-proof-request',
  version: 1,
  purpose: 'approval',
  chainId: BigInt(chainId).toString(),
  manager: descriptor.manager,
  digestVersion: descriptor.digestVersion,
  account,
  action: descriptor.action,
  attemptId: '0',
  setupNonce: '0',
  setupBodyHash: zeroHash,
  payload: '0x',
  order: { token: zeroAddress, amount: '0', payee: zeroAddress },
  validUntil: String(validUntilOf(now)),
  place: 0,
  method,
  config,
  salt: bytesToHex(randomBytes(32))
})

export const KEY_TEST_DOMAIN_NAME = 'Kohaku recovery key test'

export const KEY_TEST_TYPES = {
  KeyTest: [
    { name: 'account', type: 'address' },
    { name: 'key', type: 'address' },
    { name: 'salt', type: 'bytes32' },
    { name: 'validUntil', type: 'uint256' }
  ]
} as const

/** A guardian key's test challenge: the account, the key under test, a fresh salt and the deadline. */
export const keyTestOf = ({
  chainId,
  account,
  key,
  now,
  randomBytes
}: KeyTestInput): KeyTestTypedData => ({
  domain: { name: KEY_TEST_DOMAIN_NAME, version: '1', chainId: BigInt(chainId) },
  types: KEY_TEST_TYPES,
  primaryType: 'KeyTest',
  message: {
    account,
    key,
    salt: bytesToHex(randomBytes(32)),
    validUntil: BigInt(validUntilOf(now))
  }
})

/** The key test as the request queue takes typed data. */
export const keyTestToSignOf = (keyTest: KeyTestTypedData): TypedDataToSign => ({
  domain: keyTest.domain,
  types: { KeyTest: keyTest.types.KeyTest.map((field) => ({ ...field })) },
  primaryType: keyTest.primaryType,
  message: keyTest.message
})
