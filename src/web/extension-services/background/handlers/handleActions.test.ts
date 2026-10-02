import { FeeSpeed } from '@ambire-common/controllers/signAccountOp/signAccountOp'
import { pickSignAccountOpUpdateParams } from '@web/extension-services/background/handlers/handleActions'

// The controller mapping loads the network list, which throws without the RPC
// environment; picking the members needs none of it.
jest.mock('@web/extension-services/background/types', () => ({
  controllersNestedInMainMapping: {}
}))

type UpdateParams = Parameters<typeof pickSignAccountOpUpdateParams>[0]

const declared = (): UpdateParams =>
  ({
    accountOp: { accountAddr: '0x5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a', calls: [] },
    gasPrices: [{ name: 'slow' }],
    estimation: { ambireEstimation: null },
    feeToken: { address: '0x0000000000000000000000000000000000000000', symbol: 'ETH' },
    paidBy: '0x1111111111111111111111111111111111111111',
    speed: FeeSpeed.Fast,
    signingKeyAddr: '0x1111111111111111111111111111111111111111',
    signingKeyType: 'internal',
    gasUsedTooHighAgreed: true
  } as unknown as UpdateParams)

const DECLARED_MEMBERS = [
  'accountOp',
  'estimation',
  'feeToken',
  'gasPrices',
  'gasUsedTooHighAgreed',
  'paidBy',
  'signingKeyAddr',
  'signingKeyType',
  'speed'
]

describe('the members a page sends to the sign controller update', () => {
  it('drops the members the action does not declare', () => {
    const params = {
      ...declared(),
      calls: [{ to: '0x9999999999999999999999999999999999999999', value: 1n, data: '0x' }],
      rbfAccountOps: { x: null },
      updateType: 'Main',
      signedTransactionsCount: 1,
      somethingElse: 'x'
    } as UpdateParams

    const picked = pickSignAccountOpUpdateParams(params)

    expect(picked).not.toHaveProperty('calls')
    expect(picked).not.toHaveProperty('rbfAccountOps')
    expect(picked).not.toHaveProperty('updateType')
    expect(picked).not.toHaveProperty('signedTransactionsCount')
    expect(picked).not.toHaveProperty('somethingElse')
    expect(Object.keys(picked).sort()).toEqual(DECLARED_MEMBERS)
  })

  it('passes the declared members unchanged, the same objects included', () => {
    const params = declared()

    const picked = pickSignAccountOpUpdateParams(params)

    expect(picked).toEqual(params)
    DECLARED_MEMBERS.forEach((member) => {
      expect(picked[member as keyof typeof picked]).toBe(params[member as keyof UpdateParams])
    })
  })

  it('leaves an absent declared member out and adds nothing else', () => {
    const picked = pickSignAccountOpUpdateParams({
      paidBy: '0x1111111111111111111111111111111111111111'
    })

    expect(Object.keys(picked)).toEqual(['paidBy'])
    expect(picked.paidBy).toBe('0x1111111111111111111111111111111111111111')
    DECLARED_MEMBERS.filter((member) => member !== 'paidBy').forEach((member) => {
      expect(member in picked).toBe(false)
    })
  })
})
