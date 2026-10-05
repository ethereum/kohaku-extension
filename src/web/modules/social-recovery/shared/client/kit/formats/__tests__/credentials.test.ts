/**
 * The salt of each place, each credential's commitment and the config bytes
 * of the two methods the wallet enrolls, checked against bytes built here
 * with viem's ABI encoder.
 */
import { concat, encodeAbiParameters, encodePacked, keccak256, pad } from 'viem'

import type { Address, Credential, Hex } from '@web/modules/social-recovery/sdk-interfaces'
import {
  credentialCommitmentOf,
  defaultSaltOf,
  ecdsaConfigOf,
  passkeyConfigOf,
  placedCredentialsOf
} from '@web/modules/social-recovery/shared/client/kit/formats'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const OTHER_ACCOUNT: Address = '0x2222222222222222222222222222222222222222'
const METHOD: Address = '0x3333333333333333333333333333333333333333'
const OTHER_METHOD: Address = '0x4444444444444444444444444444444444444444'
const APPROVER: Address = '0x5555555555555555555555555555555555555555'
const SUPPLIED_SALT: Hex = `0x${'ab'.repeat(32)}`

const expectedSalt = (account: Address, place: number): Hex =>
  keccak256(
    encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [account, BigInt(place)])
  )

const credential = (method: Address, tag: string, salt?: Hex): Credential => ({
  method,
  config: encodeAbiParameters([{ type: 'string' }], [tag]),
  ...(salt ? { salt } : {})
})

describe('the default salt', () => {
  it('is the hash of the account and the place, ABI-encoded as an address and a uint256', () => {
    expect(defaultSaltOf(ACCOUNT, 0)).toBe(expectedSalt(ACCOUNT, 0))
    expect(defaultSaltOf(ACCOUNT, 7)).toBe(expectedSalt(ACCOUNT, 7))
  })

  it('is never the hash of the packed account and place', () => {
    const packed = keccak256(encodePacked(['address', 'uint256'], [ACCOUNT, 7n]))
    expect(defaultSaltOf(ACCOUNT, 7)).not.toBe(packed)
  })

  it('differs from place to place and from account to account', () => {
    expect(defaultSaltOf(ACCOUNT, 0)).not.toBe(defaultSaltOf(ACCOUNT, 1))
    expect(defaultSaltOf(ACCOUNT, 0)).not.toBe(defaultSaltOf(OTHER_ACCOUNT, 0))
  })
})

describe('the credential commitment', () => {
  it('is the hash of the method, the config and the salt, ABI-encoded', () => {
    const config = ecdsaConfigOf(APPROVER)
    const expected = keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'bytes' }, { type: 'bytes32' }],
        [METHOD, config, SUPPLIED_SALT]
      )
    )
    expect(credentialCommitmentOf(METHOD, config, SUPPLIED_SALT)).toBe(expected)
  })

  it('changes with each of the method, the config and the salt', () => {
    const config = ecdsaConfigOf(APPROVER)
    const base = credentialCommitmentOf(METHOD, config, SUPPLIED_SALT)
    expect(credentialCommitmentOf(OTHER_METHOD, config, SUPPLIED_SALT)).not.toBe(base)
    expect(credentialCommitmentOf(METHOD, ecdsaConfigOf(ACCOUNT), SUPPLIED_SALT)).not.toBe(base)
    expect(credentialCommitmentOf(METHOD, config, defaultSaltOf(ACCOUNT, 0))).not.toBe(base)
  })
})

describe('the places of a rule', () => {
  const first = credential(METHOD, 'first')
  const second = credential(OTHER_METHOD, 'second', SUPPLIED_SALT)
  const third = credential(METHOD, 'third')
  const fourth = credential(OTHER_METHOD, 'fourth')
  const configuration = {
    clauses: [
      { threshold: 2, credentials: [first, second] },
      { threshold: 1, credentials: [] },
      { threshold: 1, credentials: [third, fourth] }
    ]
  }

  it('numbers the credentials flat in body order across every clause', () => {
    const placed = placedCredentialsOf(ACCOUNT, configuration)
    expect(placed.map((p) => [p.place, p.clause, p.credential])).toEqual([
      [0, 0, first],
      [1, 0, second],
      [2, 2, third],
      [3, 2, fourth]
    ])
  })

  it('gives a credential with no salt the default salt of its flat place', () => {
    const placed = placedCredentialsOf(ACCOUNT, configuration)
    expect(placed[0].salt).toBe(expectedSalt(ACCOUNT, 0))
    expect(placed[2].salt).toBe(expectedSalt(ACCOUNT, 2))
    expect(placed[3].salt).toBe(expectedSalt(ACCOUNT, 3))
  })

  it('keeps a supplied salt over the default one', () => {
    const placed = placedCredentialsOf(ACCOUNT, configuration)
    expect(placed[1].salt).toBe(SUPPLIED_SALT)
  })

  it('reads the account into every default salt', () => {
    const mine = placedCredentialsOf(ACCOUNT, configuration)
    const theirs = placedCredentialsOf(OTHER_ACCOUNT, configuration)
    expect(theirs[2].salt).toBe(expectedSalt(OTHER_ACCOUNT, 2))
    expect(theirs[2].salt).not.toBe(mine[2].salt)
    expect(theirs[1].salt).toBe(SUPPLIED_SALT)
  })
})

describe('the config bytes of the two enrolled methods', () => {
  it('encodes a guardian as its address in one 32-byte word', () => {
    const config = ecdsaConfigOf(APPROVER)
    expect(config).toBe(pad(APPROVER, { size: 32 }))
    expect(config).toBe(encodeAbiParameters([{ type: 'address' }], [APPROVER]))
  })

  it('encodes a passkey as the words x, y and the relying-party id hash, in that order', () => {
    const x: Hex = `0x${'01'.repeat(32)}`
    const y: Hex = `0x${'02'.repeat(32)}`
    const rpIdHash: Hex = `0x${'03'.repeat(32)}`
    expect(passkeyConfigOf({ x, y, rpIdHash })).toBe(concat([x, y, rpIdHash]))
  })
})
