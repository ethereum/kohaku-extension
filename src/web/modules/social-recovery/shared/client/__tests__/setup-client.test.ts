/**
 * The setup client a screen uses confirms a save only for the draft the
 * prepared commit carries: a draft that does not recompute to that
 * commitment is refused with the code the arm screen reads as a mismatch. A
 * sealed backup the chain holds damaged is refused by the SDK's open, which
 * the unlock reads as a wrong password.
 */
import {
  BACKUP_SEALED_PAYLOAD_SIZE,
  METHOD_ECDSA_CONFIG_ABI,
  POLICY_MANAGER_WRITES_ABI
} from '@kohaku-eth/social-recovery'
import type { PreparedCall, SetupDraft } from '@kohaku-eth/social-recovery'
import { decodeFunctionData, encodeAbiParameters, encodeFunctionData, slice } from 'viem'

import { unlockFailureOf } from '@web/modules/social-recovery/recovery/entry/readout'

import { addressOf } from '@web/modules/social-recovery/shared/client/__fixtures__/addresses'
import { addressBookOf } from '@web/modules/social-recovery/shared/client/addresses'
import { buildRecoveryClient } from '@web/modules/social-recovery/shared/client/build-client'
import { descriptorOf } from '@web/modules/social-recovery/shared/client/descriptors'
import { sdkStandIn } from '@web/modules/social-recovery/shared/client/stand-in'

jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/deployment-env'),
  sepoliaDeploymentVariable: () => undefined
}))

const ACCOUNT = addressOf('account')

const draftWaiting = (wait: number): SetupDraft => ({
  wait,
  ignoresPause: false,
  privacy: { publicMetadata: '0x', backup: 'empty' },
  clauses: [
    {
      threshold: 1,
      credentials: [
        {
          method: descriptorOf('sepolia', addressBookOf('sepolia')).methodEcdsa,
          config: encodeAbiParameters(METHOD_ECDSA_CONFIG_ABI, [addressOf('guardian')])
        }
      ]
    }
  ]
})

describe('the setup client confirmSetup', () => {
  it('refuses a draft that does not recompute to the prepared commitment as a mismatch', async () => {
    sdkStandIn.reset()
    const addressBook = addressBookOf('sepolia')
    const node = sdkStandIn.nodeFor(descriptorOf('sepolia', addressBook), ACCOUNT)
    const client = await buildRecoveryClient({
      chain: 'sepolia',
      account: ACCOUNT,
      addressBook,
      provider: node
    })
    const prepared = await client.setup.prepareCommitSetup(draftWaiting(3 * 24 * 3600))
    node.land(prepared)

    await expect(
      client.setup.confirmSetup(draftWaiting(4 * 24 * 3600), prepared)
    ).rejects.toMatchObject({ name: 'CodedRefusal', code: 'confirm.commitment-mismatch' })
  })
})

describe('the setup client getSetup', () => {
  it('reads a sealed backup one byte short as a wrong password', async () => {
    sdkStandIn.reset()
    const addressBook = addressBookOf('sepolia')
    const node = sdkStandIn.nodeFor(descriptorOf('sepolia', addressBook), ACCOUNT)
    const client = await buildRecoveryClient({
      chain: 'sepolia',
      account: ACCOUNT,
      addressBook,
      provider: node
    })
    const password = 'the recovery password'
    const draft: SetupDraft = {
      ...draftWaiting(3 * 24 * 3600),
      privacy: { publicMetadata: '0x', backup: 'encrypted' }
    }
    const prepared = await client.setup.prepareCommitSetup(draft, password)
    const truncated = (call: PreparedCall): PreparedCall => {
      if (call.target.toLowerCase() !== client.descriptor.manager.toLowerCase()) {
        return call
      }
      const decoded = decodeFunctionData({ abi: POLICY_MANAGER_WRITES_ABI, data: call.data })
      if (decoded.functionName !== 'commitSetup') {
        throw new Error('the manager call is not the commit')
      }
      const [action, commitment, nonce, publicMetadata, sealed] = decoded.args
      return {
        ...call,
        data: encodeFunctionData({
          abi: POLICY_MANAGER_WRITES_ABI,
          functionName: 'commitSetup',
          args: [
            action,
            commitment,
            nonce,
            publicMetadata,
            slice(sealed, 0, BACKUP_SEALED_PAYLOAD_SIZE - 1)
          ]
        })
      }
    }
    node.land(
      prepared.kind === 'batch'
        ? { ...prepared, calls: prepared.calls.map(truncated) }
        : truncated(prepared)
    )

    const failure = await client.setup.getSetup({ password }).then(
      () => undefined,
      (thrown: unknown) => thrown
    )

    expect(failure).toMatchObject({ restoreCause: { code: 'restore.backup-unopened' } })
    expect(unlockFailureOf(failure)).toBe('wrong')
  })
})
