/**
 * Typed data carried out of the wallet as JSON: the text a signer takes with
 * `eth_signTypedData_v4`, and the file an offline block saves under a name.
 */
import { hashTypedData } from 'viem'

import type { TypedDataToSign } from '@web/modules/social-recovery/shared/client'
import {
  typedDataFileOf,
  typedDataTextOf
} from '@web/modules/social-recovery/setup/enroll/guardian'

const TYPED_DATA = {
  domain: {
    name: 'Example',
    version: '1',
    chainId: 11155111n,
    verifyingContract: '0x1111111111111111111111111111111111111111'
  },
  types: {
    Request: [
      { name: 'attemptId', type: 'uint256' },
      { name: 'validUntil', type: 'uint64' },
      { name: 'payload', type: 'bytes' }
    ]
  },
  primaryType: 'Request',
  message: { attemptId: 1180591620717411303424n, validUntil: 1_800_000_000n, payload: '0xabcdef' }
} as unknown as TypedDataToSign

describe('typed data as the JSON a signer takes', () => {
  it('spells out the domain type, writes every bigint as a decimal string and keeps the digest', () => {
    const carried = JSON.parse(typedDataTextOf(TYPED_DATA))
    expect(carried.types.EIP712Domain).toEqual([
      { name: 'name', type: 'string' },
      { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' },
      { name: 'verifyingContract', type: 'address' }
    ])
    expect(carried.domain.chainId).toBe('11155111')
    expect(carried.message).toEqual({
      attemptId: '1180591620717411303424',
      validUntil: '1800000000',
      payload: '0xabcdef'
    })
    expect(carried.primaryType).toBe('Request')
    expect(hashTypedData(carried)).toBe(
      hashTypedData(TYPED_DATA as unknown as Parameters<typeof hashTypedData>[0])
    )
  })

  it('saves the same text as a JSON file under the name it is given', () => {
    expect(typedDataFileOf(TYPED_DATA, 'request.json')).toEqual({
      name: 'request.json',
      text: typedDataTextOf(TYPED_DATA),
      type: 'application/json'
    })
  })
})
