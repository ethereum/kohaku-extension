/**
 * The Sepolia deployment variable is read from the environment, and an empty
 * or blank value counts as no variable, so the chain runs the stand-in. Every
 * address set here is made up, and the variable is restored after each test.
 */
import {
  addressBookOf,
  deploymentOf,
  PLACEHOLDER_ADDRESSES
} from '@web/modules/social-recovery/shared/client'
import {
  SEPOLIA_DEPLOYMENT_VARIABLE,
  sepoliaDeploymentVariable
} from '@web/modules/social-recovery/shared/client/deployment-env'

const NAME = 'SOCIAL_RECOVERY_SEPOLIA_DEPLOYMENT'
const FACTS = {
  manager: '0xb1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1',
  methodEcdsa: '0xb2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2',
  methodPasskey: '0xb3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3',
  action: '0xb4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4',
  deployedAt: 1,
  digestVersion: '1',
  managerVersion: '1.0.0',
  auditedActions: []
}

const before = process.env[NAME]

afterEach(() => {
  if (before === undefined) {
    delete process.env[NAME]
  } else {
    process.env[NAME] = before
  }
})

describe('the Sepolia deployment variable', () => {
  it('is named for the messages that refuse it', () => {
    process.env[NAME] = '{'
    expect(() => deploymentOf('sepolia')).toThrow(new RegExp(`^${SEPOLIA_DEPLOYMENT_VARIABLE} `))
  })

  it('is not set where the environment holds none', () => {
    delete process.env[NAME]
    expect(sepoliaDeploymentVariable()).toBeUndefined()
    expect(deploymentOf('sepolia')).toEqual({ kind: 'stand-in' })
  })

  const BLANK = ['', '   ', '\n\t ']
  BLANK.forEach((raw) =>
    it(`is not set where the value is ${JSON.stringify(raw)}`, () => {
      process.env[NAME] = raw
      expect(sepoliaDeploymentVariable()).toBeUndefined()
      expect(deploymentOf('sepolia')).toEqual({ kind: 'stand-in' })
      expect(addressBookOf('sepolia').manager).toBe(PLACEHOLDER_ADDRESSES.sepolia.manager)
    })
  )

  it('hands the raw value over as it is', () => {
    const raw = ` ${JSON.stringify(FACTS)} `
    process.env[NAME] = raw
    expect(sepoliaDeploymentVariable()).toBe(raw)
    expect(addressBookOf('sepolia').manager).toBe(FACTS.manager)
  })
})
