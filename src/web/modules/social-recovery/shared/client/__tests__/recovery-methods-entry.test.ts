/**
 * The identity methods come from the SDK's second entry point. Both factories
 * build with an injected stack, so neither needs its proving library to answer
 * which modules it serves and where its device runs.
 */
import { anonAadhaarMethod, zkPassportMethod } from '@kohaku-eth/social-recovery/recovery-methods'
import { zeroAddress } from 'viem'

import {
  DESCRIPTOR,
  METHOD_AADHAAR,
  METHOD_ZKPASSPORT
} from '@web/modules/social-recovery/shared/client/__fixtures__/scripted-provider'

const passport = () =>
  zkPassportMethod(async () => {
    throw new Error('no stack')
  })

const aadhaar = () =>
  anonAadhaarMethod({
    stack: {
      generateArgs: async () => ({}),
      prove: async () => {
        throw new Error('no stack')
      },
      verify: async () => false
    }
  })

describe('the recovery methods entry', () => {
  it('serves the deployment zkPassport module', () => {
    expect(passport().modules(DESCRIPTOR)).toEqual([METHOD_ZKPASSPORT])
  })

  it('serves the deployment Aadhaar module', () => {
    expect(aadhaar().modules(DESCRIPTOR)).toEqual([METHOD_AADHAAR])
  })

  it('serves no module where the deployment has none for the method', () => {
    const none = { ...DESCRIPTOR, methodZkpassport: zeroAddress, methodAadhaar: zeroAddress }
    expect(passport().modules(none)).toEqual([])
    expect(aadhaar().modules(none)).toEqual([])
  })

  it('runs zkPassport in an app on another device', () => {
    expect(passport().deviceBinding).toBe('external-app')
  })

  it('runs the Aadhaar prover in this browser', () => {
    expect(aadhaar().deviceBinding).toBe('in-browser-prover')
  })
})
