/**
 * The identity methods' parameters are build data per chain: fixed values on
 * the stand-in chain, the deployment's facts on a deployed one, where a
 * method whose facts or module address are missing has none. The client hands each identity
 * method its params for one call, the zkPassport ones carrying the name and
 * the purpose the phone shows; the SDK's own methods take them as they are.
 */
import { anonAadhaarMethod, zkPassportMethod } from '@kohaku-eth/social-recovery/recovery-methods'

import en from '@common/config/localization/translations/en.json'
import type { CeremonyCall } from '@web/modules/social-recovery/shared/ceremony'
import {
  buildRecoveryClient,
  createDeployedWorld,
  createWorld,
  DEPLOYED_FACTS
} from '@web/modules/social-recovery/shared/client/__tests__/harness'
import { addressOf } from '@web/modules/social-recovery/shared/client/__fixtures__/addresses'
import { sepoliaDeploymentVariable } from '@web/modules/social-recovery/shared/client/deployment-env'
import { SEPOLIA_DEPLOYMENT } from '@web/modules/social-recovery/shared/client/deployments-sepolia'
import {
  identityParamsOf,
  methodParamsOf
} from '@web/modules/social-recovery/shared/client/identity-params'
import {
  createScriptedAadhaarStack,
  createScriptedZkPassportStack
} from '@web/modules/social-recovery/shared/client/scripted'
import type { DeploymentFacts } from '@web/modules/social-recovery/shared/client/types'
import type {
  GapCase,
  IdentityFactoryCalls,
  UndeployedCase
} from '@web/modules/social-recovery/shared/client/__fixtures__/types'

const mockFactoryCalls: IdentityFactoryCalls = { zkPassport: [], aadhaar: [] }

// The SDK's own factories, recording the options the build hands them.
jest.mock('@kohaku-eth/social-recovery/recovery-methods', () => {
  const actual = jest.requireActual('@kohaku-eth/social-recovery/recovery-methods')
  return {
    ...actual,
    zkPassportMethod: (options: IdentityFactoryCalls['zkPassport'][number]) => {
      mockFactoryCalls.zkPassport.push(options)
      return actual.zkPassportMethod(options)
    },
    anonAadhaarMethod: (options: IdentityFactoryCalls['aadhaar'][number]) => {
      mockFactoryCalls.aadhaar.push(options)
      return actual.anonAadhaarMethod(options)
    }
  }
})

jest.mock('@web/modules/social-recovery/shared/client/deployment-env', () => ({
  ...jest.requireActual('@web/modules/social-recovery/shared/client/deployment-env'),
  sepoliaDeploymentVariable: jest.fn()
}))

const variable = sepoliaDeploymentVariable as jest.MockedFunction<typeof sepoliaDeploymentVariable>

afterEach(() => {
  variable.mockReset()
  jest.restoreAllMocks()
})

const STRINGS = en.socialRecovery.ceremony
const CERTIFICATE = '-----BEGIN CERTIFICATE-----\nMIIBdeployed\n-----END CERTIFICATE-----'
const SEED = '123456789012345678901234567890'

const IDENTITY_FACTS: DeploymentFacts = {
  ...DEPLOYED_FACTS,
  methodZkpassport: addressOf('deployed-method-zkpassport'),
  methodAadhaar: addressOf('deployed-method-aadhaar'),
  zkPassportDomain: 'kohaku.example',
  zkPassportScope: 'kohaku-recovery-sepolia',
  zkPassportTestnetTree: true,
  aadhaarNullifierSeed: SEED,
  aadhaarCertificate: CERTIFICATE,
  aadhaarTestMode: true
}

const without = (...fields: (keyof DeploymentFacts)[]): DeploymentFacts => {
  const facts: DeploymentFacts = { ...IDENTITY_FACTS }
  fields.forEach((field) => {
    delete facts[field]
  })
  return facts
}

const STAND_IN = {
  zkPassport: { domain: 'kohaku.stand-in', scope: 'kohaku-recovery', testnetTree: false },
  aadhaar: {
    nullifierSeed: 1n,
    issuerCertificate: '-----BEGIN CERTIFICATE-----\nstand-in\n-----END CERTIFICATE-----',
    testMode: false
  }
}

const CALLS: CeremonyCall[] = ['enroll', 'testAccess', 'createClaim', 'healthCheck']

describe('the identity parameters of a chain', () => {
  it('reads the fixed stand-in values on mainnet, which runs the stand-in', () => {
    variable.mockReturnValue(undefined)
    expect(identityParamsOf('mainnet')).toEqual(STAND_IN)
  })

  it("reads the committed Sepolia deployment's values where no variable is set", () => {
    variable.mockReturnValue(undefined)
    expect(identityParamsOf('sepolia')).toEqual({
      zkPassport: {
        domain: 'social-recovery.kohaku.test',
        scope: 'kohaku-social-recovery',
        testnetTree: true
      },
      aadhaar: {
        nullifierSeed: 11155111n,
        issuerCertificate: SEPOLIA_DEPLOYMENT.aadhaarCertificate,
        testMode: false
      }
    })
  })

  it("reads a deployed chain's facts, the seed as a number", () => {
    variable.mockReturnValue(JSON.stringify(IDENTITY_FACTS))
    expect(identityParamsOf('sepolia')).toEqual({
      zkPassport: { domain: 'kohaku.example', scope: 'kohaku-recovery-sepolia', testnetTree: true },
      aadhaar: { nullifierSeed: BigInt(SEED), issuerCertificate: CERTIFICATE, testMode: true }
    })
  })

  it('reads the facts it is handed over those of the chain', () => {
    variable.mockReturnValue(undefined)
    expect(identityParamsOf('sepolia', IDENTITY_FACTS).zkPassport?.domain).toBe('kohaku.example')
  })

  it('reads the Aadhaar test mode as off where the facts do not name it', () => {
    expect(identityParamsOf('sepolia', without('aadhaarTestMode')).aadhaar).toEqual({
      nullifierSeed: BigInt(SEED),
      issuerCertificate: CERTIFICATE,
      testMode: false
    })
  })

  it('proves against the production tree where the facts do not name the test tree', () => {
    expect(identityParamsOf('sepolia', without('zkPassportTestnetTree')).zkPassport).toEqual({
      domain: 'kohaku.example',
      scope: 'kohaku-recovery-sepolia',
      testnetTree: false
    })
  })

  const GAPS: GapCase[] = [
    ['the zkPassport domain', ['zkPassportDomain'], 'zkPassport'],
    ['the zkPassport scope', ['zkPassportScope'], 'zkPassport'],
    ['both zkPassport fields', ['zkPassportDomain', 'zkPassportScope'], 'zkPassport'],
    ['the Aadhaar seed', ['aadhaarNullifierSeed'], 'aadhaar'],
    ['the Aadhaar certificate', ['aadhaarCertificate'], 'aadhaar'],
    ['both Aadhaar fields', ['aadhaarNullifierSeed', 'aadhaarCertificate'], 'aadhaar']
  ]
  GAPS.forEach(([what, fields, missing]) =>
    it(`holds no ${missing} params, and keeps the other method's, where the facts omit ${what}`, () => {
      const reading = identityParamsOf('sepolia', without(...fields))
      expect(reading[missing]).toBeUndefined()
      const other = missing === 'zkPassport' ? 'aadhaar' : 'zkPassport'
      expect(reading[other]).toBeDefined()
    })
  )

  const UNDEPLOYED: UndeployedCase[] = [
    ['zkPassport', 'methodZkpassport'],
    ['aadhaar', 'methodAadhaar']
  ]
  UNDEPLOYED.forEach(([missing, address]) =>
    it(`holds no ${missing} params, though the facts carry them, where the deployment names no ${missing} module`, () => {
      const reading = identityParamsOf('sepolia', without(address))
      expect(reading[missing]).toBeUndefined()
      const other = missing === 'zkPassport' ? 'aadhaar' : 'zkPassport'
      expect(reading[other]).toBeDefined()
    })
  )

  it('holds no params at all for a deployed chain whose facts name no identity field', () => {
    expect(identityParamsOf('sepolia', DEPLOYED_FACTS)).toEqual({})
  })
})

describe('the params an identity method takes for one call', () => {
  CALLS.forEach((call) =>
    it(`hands the zkPassport method the domain, the scope, the name and the purpose of ${call}`, () => {
      const purpose = {
        enroll: STRINGS.phoneRequestPurposeEnroll,
        testAccess: STRINGS.phoneRequestPurposeTest,
        createClaim: STRINGS.phoneRequestPurposeClaim,
        healthCheck: STRINGS.phoneRequestPurposeEnroll
      }[call]
      expect(methodParamsOf(STAND_IN, 'zkpassport', call)).toEqual({
        domain: 'kohaku.stand-in',
        scope: 'kohaku-recovery',
        name: STRINGS.phoneRequestName,
        purpose
      })
    })
  )

  it('shows the phone a different purpose at an enrollment, an access test and a claim', () => {
    const purposes = (['enroll', 'testAccess', 'createClaim'] as const).map(
      (call) => methodParamsOf(STAND_IN, 'zkpassport', call)?.purpose
    )
    expect(new Set(purposes).size).toBe(3)
  })

  CALLS.forEach((call) =>
    it(`hands the Aadhaar method the seed and the issuer certificate at ${call}`, () => {
      expect(methodParamsOf(STAND_IN, 'aadhaar', call)).toEqual({
        nullifierSeed: 1n,
        issuerCertificate: STAND_IN.aadhaar.issuerCertificate
      })
    })
  )

  it('never hands the phone the test-tree switch, which is no SDK param', () => {
    const params = methodParamsOf(
      { zkPassport: { ...STAND_IN.zkPassport, testnetTree: true } },
      'zkpassport',
      'enroll'
    )
    expect(params).not.toHaveProperty('testnetTree')
    expect(params).not.toHaveProperty('devMode')
  })
  ;['passkey', 'ecdsa', 'guardian', ''].forEach((slug) =>
    it(`hands nothing for the slug '${slug}'`, () => {
      CALLS.forEach((call) => expect(methodParamsOf(STAND_IN, slug, call)).toBeUndefined())
    })
  )

  it('hands nothing for a method the chain holds no params of', () => {
    expect(methodParamsOf({ aadhaar: STAND_IN.aadhaar }, 'zkpassport', 'enroll')).toBeUndefined()
    expect(methodParamsOf({ zkPassport: STAND_IN.zkPassport }, 'aadhaar', 'enroll')).toBeUndefined()
  })

  it("is taken as it is by the SDK's own zkPassport method, which carries the phone's name and purpose", () => {
    const method = zkPassportMethod({ stack: createScriptedZkPassportStack() })
    CALLS.forEach((call) => {
      const params = methodParamsOf(STAND_IN, 'zkpassport', call)
      if (!params) {
        throw new Error('no params')
      }
      expect(method.enrollInput(params)).toMatchObject({
        kind: 'ceremony',
        domain: 'kohaku.stand-in',
        scope: 'kohaku-recovery',
        name: STRINGS.phoneRequestName,
        purpose: params.purpose
      })
    })
  })

  it("is taken as it is by the SDK's own Aadhaar method", () => {
    const method = anonAadhaarMethod({ stack: createScriptedAadhaarStack() })
    const params = methodParamsOf(STAND_IN, 'aadhaar', 'enroll')
    if (!params) {
      throw new Error('no params')
    }
    expect(method.enrollInput(params)).toMatchObject({ nullifierSeed: 1n })
  })
})

describe("the client's params for an identity method", () => {
  it('hands the stand-in values on a chain with no deployment', async () => {
    variable.mockReturnValue(undefined)
    const client = await buildRecoveryClient(createWorld({ chain: 'mainnet' }).config)
    expect(client.methodParamsFor('zkpassport', 'createClaim')).toEqual({
      domain: 'kohaku.stand-in',
      scope: 'kohaku-recovery',
      name: STRINGS.phoneRequestName,
      purpose: STRINGS.phoneRequestPurposeClaim
    })
    expect(client.methodParamsFor('aadhaar', 'enroll')).toEqual({
      nullifierSeed: 1n,
      issuerCertificate: STAND_IN.aadhaar.issuerCertificate
    })
    expect(client.methodParamsFor('passkey', 'enroll')).toBeUndefined()
  })

  it("hands the deployment's values on a deployed chain", async () => {
    variable.mockReturnValue(JSON.stringify(IDENTITY_FACTS))
    const client = await buildRecoveryClient(createDeployedWorld().config)
    expect(client.methodParamsFor('zkpassport', 'enroll')).toEqual({
      domain: 'kohaku.example',
      scope: 'kohaku-recovery-sepolia',
      name: STRINGS.phoneRequestName,
      purpose: STRINGS.phoneRequestPurposeEnroll
    })
    expect(client.methodParamsFor('aadhaar', 'createClaim')).toEqual({
      nullifierSeed: BigInt(SEED),
      issuerCertificate: CERTIFICATE
    })
  })

  it('hands nothing for a method whose fields the deployment omits, and still serves the method', async () => {
    variable.mockReturnValue(JSON.stringify(without('aadhaarNullifierSeed', 'aadhaarCertificate')))
    const client = await buildRecoveryClient(createDeployedWorld().config)
    expect(client.methodParamsFor('aadhaar', 'enroll')).toBeUndefined()
    expect(client.methodParamsFor('zkpassport', 'enroll')).toBeDefined()
    expect(client.methodFor('aadhaar')).toBeDefined()
  })
  ;(
    [
      ['zkpassport', 'methodZkpassport'],
      ['aadhaar', 'methodAadhaar']
    ] as const
  ).forEach(([slug, address]) =>
    it(`neither serves ${slug} nor hands its params where the deployment names no module for it`, async () => {
      variable.mockReturnValue(JSON.stringify(without(address)))
      const client = await buildRecoveryClient(createDeployedWorld().config)
      CALLS.forEach((call) => expect(client.methodParamsFor(slug, call)).toBeUndefined())
      expect(client.methodFor(slug)).toBeUndefined()
      const other = slug === 'zkpassport' ? 'aadhaar' : 'zkpassport'
      expect(client.methodFor(other)).toBeDefined()
      expect(client.methodParamsFor(other, 'enroll')).toBeDefined()
    })
  )
})

describe('the identity methods a built client constructs', () => {
  beforeEach(() => {
    mockFactoryCalls.zkPassport = []
    mockFactoryCalls.aadhaar = []
  })

  const lastOptions = () => ({
    zkPassport: mockFactoryCalls.zkPassport[mockFactoryCalls.zkPassport.length - 1],
    aadhaar: mockFactoryCalls.aadhaar[mockFactoryCalls.aadhaar.length - 1]
  })

  it("hands a deployed chain's test-tree fact to zkPassport as dev mode and its Aadhaar test-mode fact as test mode", async () => {
    variable.mockReturnValue(JSON.stringify(IDENTITY_FACTS))
    await buildRecoveryClient(createDeployedWorld().config)
    const { zkPassport, aadhaar } = lastOptions()
    expect(zkPassport).toMatchObject({ devMode: true })
    expect(aadhaar).toMatchObject({ testMode: true })
  })

  it('turns both modes off on a deployed chain whose facts name neither', async () => {
    variable.mockReturnValue(JSON.stringify(without('zkPassportTestnetTree', 'aadhaarTestMode')))
    await buildRecoveryClient(createDeployedWorld().config)
    const { zkPassport, aadhaar } = lastOptions()
    expect(zkPassport).toMatchObject({ devMode: false })
    expect(aadhaar).toMatchObject({ testMode: false })
  })

  it('hands neither mode on the stand-in chain, only its scripted stacks', async () => {
    variable.mockReturnValue(undefined)
    await buildRecoveryClient(createWorld({ chain: 'mainnet' }).config)
    const { zkPassport, aadhaar } = lastOptions()
    expect(zkPassport?.stack).toBeDefined()
    expect(zkPassport).not.toHaveProperty('devMode')
    expect(aadhaar?.stack).toBeDefined()
    expect(aadhaar).not.toHaveProperty('testMode')
  })
})
