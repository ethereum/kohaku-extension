/**
 * The manager's views decode the manager's ABI-encoded answers, keep a
 * revert's data, pass a failed read through and refuse an answer that does
 * not decode. The answers are encoded here from hand-written signatures.
 */
import {
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  type Hex,
  parseAbi,
  zeroHash
} from 'viem'

import type {
  Address,
  AttemptRequest,
  BlockTag,
  CancelRequest,
  IProvider
} from '@web/modules/social-recovery/sdk-interfaces'
import {
  isProviderReadFailure,
  isRevertedCall,
  providerReadFailure,
  revertedCall
} from '@web/modules/social-recovery/shared/client/provider-adapter'
import { createManagerReads } from '@web/modules/social-recovery/shared/client/kit/reads'

const MANAGER: Address = '0x734B9Aa580d4A184Ea129E791C4C9Fb8734B3aC6'
const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'
const ACTION: Address = '0x6666666666666666666666666666666666666666'
const TOKEN: Address = '0x8888888888888888888888888888888888888888'
const PAYEE: Address = '0x9999999999999999999999999999999999999999'
const METHOD_A: Address = '0x3333333333333333333333333333333333333333'
const METHOD_B: Address = '0x4444444444444444444444444444444444444444'
const COMMITMENT: Hex = `0x${'5a'.repeat(32)}`
const PAYLOAD_HASH: Hex = `0x${'7c'.repeat(32)}`

const MANAGER_VIEWS = parseAbi([
  'function stateOf(address account, address action) view returns ((bytes32, uint64, uint64, uint48, (uint64, uint64, uint48, uint8, bool, bytes32, (address, uint256, address), address[])))',
  'function eip712Domain() view returns (bytes1, string, string, uint256, address, bytes32, uint256[])',
  'function name() view returns (string)',
  'function version() view returns (string)',
  'function supportsInterface(bytes4 id) view returns (bool)',
  'function hashApproval((address account, address action, uint64 attemptId, uint64 setupNonce, bytes setupBody, bytes payload, (address token, uint256 amount, address payee) order, uint48 validUntil, (uint256 place, address method, bytes config, bytes32 salt, bytes proof)[] proofs) request, uint256 place) view returns (bytes32)',
  'function hashCancel((address account, address action, uint64 attemptId, uint64 setupNonce, bytes setupBody, uint48 validUntil, (uint256 place, address method, bytes config, bytes32 salt, bytes proof)[] proofs) request, uint256 place) view returns (bytes32)',
  'error PolicyManager_NoSetup(address account, address action)'
])

const stateOfCall = encodeFunctionData({
  abi: MANAGER_VIEWS,
  functionName: 'stateOf',
  args: [ACCOUNT, ACTION]
})

const stateAnswer = (attemptState: number): Hex =>
  encodeFunctionResult({
    abi: MANAGER_VIEWS,
    functionName: 'stateOf',
    result: [
      COMMITMENT,
      3n,
      5n,
      11829400,
      [
        4n,
        3n,
        1_700_000_000,
        attemptState,
        true,
        PAYLOAD_HASH,
        [TOKEN, 250n, PAYEE],
        [METHOD_A, METHOD_B]
      ]
    ]
  })

const providerAnswering = (answers: [Hex, Hex | Error][]) => {
  const routes = new Map(answers)
  const call = jest.fn(
    async (to: Address, data: Hex, from: Address | undefined, block: BlockTag): Promise<Hex> => {
      const answer = routes.get(data)
      if (answer === undefined) {
        throw new Error(`no answer scripted for ${data} to ${to} from ${from} at ${block}`)
      }
      if (answer instanceof Error) {
        throw answer
      }
      return answer
    }
  )
  const provider: IProvider = { chainId: jest.fn(), call, logs: jest.fn(), block: jest.fn() }
  return { provider, call }
}

describe('the manager reads stateOf', () => {
  it('decodes the nested state, the attempt and its payment order', async () => {
    const { provider, call } = providerAnswering([[stateOfCall, stateAnswer(1)]])
    const state = await createManagerReads(provider, MANAGER).stateOf(ACCOUNT, ACTION)
    expect(state).toEqual({
      setupCommitment: COMMITMENT,
      setupNonce: 3n,
      nextAttemptId: 5n,
      setupCommittedAtBlock: 11829400,
      attempt: {
        state: 'Waiting',
        attemptId: 4n,
        setupNonce: 3n,
        consumableAfter: 1_700_000_000,
        payloadHash: PAYLOAD_HASH,
        order: { token: TOKEN, amount: 250n, payee: PAYEE },
        usedMethods: [METHOD_A, METHOD_B],
        ignoresPause: true
      }
    })
    expect(call).toHaveBeenCalledWith(MANAGER, stateOfCall, undefined, 'latest')
  })
  ;(
    [
      [0, 'None'],
      [2, 'Cancelled'],
      [3, 'Consumed']
    ] as const
  ).forEach(([index, name]) =>
    it(`maps attempt state ${index} to ${name}`, async () => {
      const { provider } = providerAnswering([[stateOfCall, stateAnswer(index)]])
      const state = await createManagerReads(provider, MANAGER).stateOf(ACCOUNT, ACTION)
      expect(state.attempt.state).toBe(name)
    })
  )

  it('refuses an attempt state outside the enum as a failed call read', async () => {
    const { provider } = providerAnswering([[stateOfCall, stateAnswer(4)]])
    const thrown = await createManagerReads(provider, MANAGER)
      .stateOf(ACCOUNT, ACTION)
      .catch((error: unknown) => error)
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'call' })
  })

  it('reads at the block it is given', async () => {
    const { provider, call } = providerAnswering([[stateOfCall, stateAnswer(0)]])
    await createManagerReads(provider, MANAGER).stateOf(ACCOUNT, ACTION, 11829500)
    expect(call).toHaveBeenCalledWith(MANAGER, stateOfCall, undefined, 11829500)
  })

  it('keeps the data of a revert', async () => {
    const data = encodeErrorResult({
      abi: MANAGER_VIEWS,
      errorName: 'PolicyManager_NoSetup',
      args: [ACCOUNT, ACTION]
    })
    const reverted = revertedCall('call', data)
    const { provider } = providerAnswering([[stateOfCall, reverted]])
    const thrown = await createManagerReads(provider, MANAGER)
      .stateOf(ACCOUNT, ACTION)
      .catch((error: unknown) => error)
    expect(isRevertedCall(thrown)).toBe(true)
    expect(thrown).toMatchObject({ data })
  })

  it('passes a failed read through as it is', async () => {
    const failure = providerReadFailure('call', new Error('timeout'))
    const { provider } = providerAnswering([[stateOfCall, failure]])
    await expect(createManagerReads(provider, MANAGER).stateOf(ACCOUNT, ACTION)).rejects.toBe(
      failure
    )
  })

  it('refuses an empty answer as a failed call read', async () => {
    const { provider } = providerAnswering([[stateOfCall, '0x']])
    const thrown = await createManagerReads(provider, MANAGER)
      .stateOf(ACCOUNT, ACTION)
      .catch((error: unknown) => error)
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'call' })
  })
})

describe('the manager reads its domain and its identity', () => {
  const domainCall = encodeFunctionData({ abi: MANAGER_VIEWS, functionName: 'eip712Domain' })
  const nameCall = encodeFunctionData({ abi: MANAGER_VIEWS, functionName: 'name' })
  const versionCall = encodeFunctionData({ abi: MANAGER_VIEWS, functionName: 'version' })
  const probeCall = encodeFunctionData({
    abi: MANAGER_VIEWS,
    functionName: 'supportsInterface',
    args: ['0x675e6a4a']
  })

  it('decodes eip712Domain into the domain fields', async () => {
    const { provider, call } = providerAnswering([
      [
        domainCall,
        encodeFunctionResult({
          abi: MANAGER_VIEWS,
          functionName: 'eip712Domain',
          result: ['0x0f', 'PolicyManager', '1', 11155111n, MANAGER, zeroHash, [7n]]
        })
      ]
    ])
    await expect(createManagerReads(provider, MANAGER).eip712Domain()).resolves.toEqual({
      fields: '0x0f',
      name: 'PolicyManager',
      version: '1',
      chainId: 11155111n,
      verifyingContract: MANAGER,
      salt: zeroHash,
      extensions: [7n]
    })
    expect(call).toHaveBeenCalledWith(MANAGER, domainCall, undefined, 'latest')
  })

  it('decodes name, version and an interface probe', async () => {
    const { provider } = providerAnswering([
      [
        nameCall,
        encodeFunctionResult({ abi: MANAGER_VIEWS, functionName: 'name', result: 'PolicyManager' })
      ],
      [
        versionCall,
        encodeFunctionResult({ abi: MANAGER_VIEWS, functionName: 'version', result: '1.0.0' })
      ],
      [
        probeCall,
        encodeFunctionResult({
          abi: MANAGER_VIEWS,
          functionName: 'supportsInterface',
          result: true
        })
      ]
    ])
    const reads = createManagerReads(provider, MANAGER)
    await expect(reads.name()).resolves.toBe('PolicyManager')
    await expect(reads.version()).resolves.toBe('1.0.0')
    await expect(reads.supportsInterface('0x675e6a4a')).resolves.toBe(true)
  })

  it('refuses an empty domain answer as a failed call read', async () => {
    const { provider } = providerAnswering([[domainCall, '0x']])
    const thrown = await createManagerReads(provider, MANAGER)
      .eip712Domain()
      .catch((error: unknown) => error)
    expect(isProviderReadFailure(thrown)).toBe(true)
    expect(thrown).toMatchObject({ read: 'call' })
  })
})

describe('the manager reads the digests of a request', () => {
  const DIGEST: Hex = `0x${'d1'.repeat(32)}`
  const BODY: Hex = '0xc0ffee'
  const approval: AttemptRequest = {
    account: ACCOUNT,
    action: ACTION,
    attemptId: 5n,
    setupNonce: 3n,
    setupBody: BODY,
    payload: '0xabcdef',
    order: { token: TOKEN, amount: 250n, payee: PAYEE },
    validUntil: 1_700_000_600,
    proofs: []
  }
  const cancellation: CancelRequest = {
    account: ACCOUNT,
    action: ACTION,
    attemptId: 4n,
    setupNonce: 3n,
    setupBody: BODY,
    validUntil: 1_700_000_300,
    proofs: []
  }
  const approvalCall = encodeFunctionData({
    abi: MANAGER_VIEWS,
    functionName: 'hashApproval',
    args: [approval, 2n]
  })
  const cancelCall = encodeFunctionData({
    abi: MANAGER_VIEWS,
    functionName: 'hashCancel',
    args: [cancellation, 0n]
  })
  const digestAnswer = (functionName: 'hashApproval' | 'hashCancel'): Hex =>
    encodeFunctionResult({ abi: MANAGER_VIEWS, functionName, result: DIGEST })

  it('sends the opening request and the place, and decodes the digest', async () => {
    const { provider, call } = providerAnswering([[approvalCall, digestAnswer('hashApproval')]])
    await expect(createManagerReads(provider, MANAGER).hashApproval(approval, 2n)).resolves.toBe(
      DIGEST
    )
    const [to, data] = call.mock.calls[0]
    expect(to).toBe(MANAGER)
    const decoded = decodeFunctionData({ abi: MANAGER_VIEWS, data })
    expect(decoded.functionName).toBe('hashApproval')
    expect(decoded.args).toEqual([approval, 2n])
  })

  it('sends the cancellation request without a payload or an order', async () => {
    const { provider, call } = providerAnswering([[cancelCall, digestAnswer('hashCancel')]])
    const withExtras = { ...cancellation, payload: '0xabcdef' } as CancelRequest
    await expect(createManagerReads(provider, MANAGER).hashCancel(withExtras, 0n)).resolves.toBe(
      DIGEST
    )
    const decoded = decodeFunctionData({ abi: MANAGER_VIEWS, data: call.mock.calls[0][1] })
    expect(decoded.functionName).toBe('hashCancel')
    expect(decoded.args).toEqual([cancellation, 0n])
  })

  it('keeps the data of a revert', async () => {
    const data = encodeErrorResult({
      abi: MANAGER_VIEWS,
      errorName: 'PolicyManager_NoSetup',
      args: [ACCOUNT, ACTION]
    })
    const { provider } = providerAnswering([[approvalCall, revertedCall('call', data)]])
    const thrown = await createManagerReads(provider, MANAGER)
      .hashApproval(approval, 2n)
      .catch((error: unknown) => error)
    expect(isRevertedCall(thrown)).toBe(true)
    expect(thrown).toMatchObject({ data })
  })

  it('refuses an answer that does not decode as a failed call read', async () => {
    const { provider } = providerAnswering([
      [approvalCall, '0x'],
      [cancelCall, '0x1234']
    ])
    const reads = createManagerReads(provider, MANAGER)
    const thrown = [
      await reads.hashApproval(approval, 2n).catch((error: unknown) => error),
      await reads.hashCancel(cancellation, 0n).catch((error: unknown) => error)
    ]
    thrown.forEach((error) => {
      expect(isProviderReadFailure(error)).toBe(true)
      expect(error).toMatchObject({ read: 'call' })
    })
  })
})
