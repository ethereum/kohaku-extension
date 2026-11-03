/**
 * A pasted reply judged through the client the build with no deployment
 * hands a screen: the fake node's ECDSA module satisfies a proof the
 * guardian's own key signed over the request's digest and rejects one another
 * key signed; its passkey module answers the verdict the world was seeded
 * with, and with no seed satisfies a proof the passkey layout encodes.
 */
import {
  approvalDigest,
  METHOD_ECDSA_CONFIG_ABI,
  METHOD_PASSKEY_PROOF_ABI
} from '@kohaku-eth/social-recovery'
import type { Address, Hex, Reply } from '@kohaku-eth/social-recovery'
import { encodeAbiParameters, stringToHex, zeroAddress } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { addressOf } from '@web/modules/social-recovery/shared/client/__fixtures__/addresses'
import type { ApprovalRequest } from '@web/modules/social-recovery/shared/client/scripted/__fixtures__/types'
import { addressBookOf } from '@web/modules/social-recovery/shared/client/addresses'
import { buildRecoveryClient } from '@web/modules/social-recovery/shared/client/build-client'
import { descriptorOf } from '@web/modules/social-recovery/shared/client/descriptors'
import { sdkStandIn } from '@web/modules/social-recovery/shared/client/stand-in'

jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/deployment-env'),
  sepoliaDeploymentVariable: () => undefined
}))

const ACCOUNT = addressOf('account')
const GUARDIAN = privateKeyToAccount(generatePrivateKey())
const STRANGER = privateKeyToAccount(generatePrivateKey())

const clientOf = () => {
  sdkStandIn.reset()
  const addressBook = addressBookOf('sepolia')
  return buildRecoveryClient({
    chain: 'sepolia',
    account: ACCOUNT,
    addressBook,
    provider: sdkStandIn.nodeFor(descriptorOf('sepolia', addressBook), ACCOUNT)
  })
}

const requestFor = (
  method: Address,
  config: Hex,
  manager: Address,
  action: Address
): ApprovalRequest => ({
  kind: 'recovery-proof-request',
  version: 1,
  purpose: 'approval',
  chainId: '11155111',
  manager,
  digestVersion: '1',
  account: ACCOUNT,
  action,
  attemptId: '1',
  setupNonce: '1',
  setupBodyHash: `0x${'dd'.repeat(32)}`,
  validUntil: '1790000000',
  place: 0,
  method,
  config,
  salt: `0x${'00'.repeat(32)}`,
  credentialHoldsCode: false,
  payload: '0x1234',
  order: { token: zeroAddress, amount: '0', payee: zeroAddress }
})

const digestOf = (request: ApprovalRequest): Hex =>
  approvalDigest(
    {
      chainId: Number(request.chainId),
      manager: request.manager,
      account: request.account,
      action: request.action,
      attemptId: BigInt(request.attemptId),
      setupNonce: BigInt(request.setupNonce),
      setupBodyHash: request.setupBodyHash,
      validUntil: Number(request.validUntil),
      payload: request.payload,
      order: { ...request.order, amount: 0n }
    },
    request.place
  )

const replyTo = (request: ApprovalRequest, proof: Hex): Reply => ({
  kind: 'recovery-proof-reply',
  version: 1,
  chainId: request.chainId,
  manager: request.manager,
  account: request.account,
  action: request.action,
  attemptId: request.attemptId,
  purpose: 'approval',
  place: request.place,
  method: request.method,
  config: request.config,
  salt: request.salt,
  digest: digestOf(request),
  proof
})

describe('the fake node judges a pasted reply', () => {
  it("satisfies an ECDSA reply the guardian's key signed and rejects one another key signed", async () => {
    const client = await clientOf()
    const { descriptor } = client
    const config = encodeAbiParameters(METHOD_ECDSA_CONFIG_ABI, [GUARDIAN.address])
    const request = requestFor(
      descriptor.methodEcdsa,
      config,
      descriptor.manager,
      descriptor.action
    )
    const digest = digestOf(request)

    const signed = replyTo(request, await GUARDIAN.sign({ hash: digest }))
    await expect(client.walletReads.verifyReply(request, signed)).resolves.toBe('satisfied')

    const forged = replyTo(request, await STRANGER.sign({ hash: digest }))
    await expect(client.walletReads.verifyReply(request, forged)).resolves.toBe('rejected')
  })

  it('answers the verdict the world was seeded with for a passkey reply', async () => {
    const client = await clientOf()
    const { descriptor } = client
    const config: Hex = `0x${'a1'.repeat(96)}`
    const request = requestFor(
      descriptor.methodPasskey,
      config,
      descriptor.manager,
      descriptor.action
    )
    const node = sdkStandIn.nodeFor(descriptor, ACCOUNT)

    node.setVerdict(config, 'rejected')
    await expect(client.walletReads.verifyReply(request, replyTo(request, '0x01'))).resolves.toBe(
      'rejected'
    )
    node.setVerdict(config, 'satisfied')
    await expect(client.walletReads.verifyReply(request, replyTo(request, '0x01'))).resolves.toBe(
      'satisfied'
    )
  })

  it('satisfies an unseeded passkey reply whose proof the passkey layout encodes, and rejects bytes it does not', async () => {
    const client = await clientOf()
    const { descriptor } = client
    const request = requestFor(
      descriptor.methodPasskey,
      `0x${'b2'.repeat(96)}`,
      descriptor.manager,
      descriptor.action
    )
    const proof = encodeAbiParameters(METHOD_PASSKEY_PROOF_ABI, [
      `0x${'00'.repeat(37)}`,
      stringToHex('{}'),
      1n,
      1n
    ])

    await expect(client.walletReads.verifyReply(request, replyTo(request, proof))).resolves.toBe(
      'satisfied'
    )
    await expect(client.walletReads.verifyReply(request, replyTo(request, '0x01'))).resolves.toBe(
      'rejected'
    )
  })
})
