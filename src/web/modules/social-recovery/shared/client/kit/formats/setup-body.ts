/**
 * The setup body the manager's commitment closes over and every attempt
 * carries: the wait, the pause choice and the clauses, each clause a
 * threshold over its credentials' commitments. This file alone knows its
 * layout: three top-level values, `abi.encode(uint48 wait, bool ignoresPause,
 * (uint8 threshold, bytes32[] credentials)[] clauses)`, with no outer tuple.
 */
import { encodeAbiParameters } from 'viem'

import type { Address, Configuration, Hex } from '@web/modules/social-recovery/sdk-interfaces'

import { credentialCommitmentOf, placedCredentialsOf } from './credentials'

const SETUP_BODY = [
  { name: 'wait', type: 'uint48' },
  { name: 'ignoresPause', type: 'bool' },
  {
    name: 'clauses',
    type: 'tuple[]',
    components: [
      { name: 'threshold', type: 'uint8' },
      { name: 'credentials', type: 'bytes32[]' }
    ]
  }
] as const

/**
 * The setup body of a configuration for an account. A credential without a
 * salt takes its place's default salt. Labels play no part. Throws where a
 * wait or a threshold does not fit its field.
 */
export const setupBodyOf = (account: Address, configuration: Configuration): Hex => {
  const placed = placedCredentialsOf(account, configuration)
  return encodeAbiParameters(SETUP_BODY, [
    Number(configuration.wait),
    configuration.ignoresPause,
    configuration.clauses.map((clause, index) => ({
      threshold: clause.threshold,
      credentials: placed
        .filter((p) => p.clause === index)
        .map((p) => credentialCommitmentOf(p.credential.method, p.credential.config, p.salt))
    }))
  ])
}
