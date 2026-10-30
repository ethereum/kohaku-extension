/**
 * A screen imports the SDK's runtime through
 * `@web/modules/social-recovery/shared/client`. The stand-in that builds over
 * the fake node and the React hooks stay out of that barrel, and the barrel
 * hands out the client layer's own functions, never one of the package's.
 */
import * as sdk from '@kohaku-eth/social-recovery'

import * as client from '@web/modules/social-recovery/shared/client'

describe('the client barrel', () => {
  it('does not export the SDK stand-in', () => {
    expect(Object.keys(client)).not.toContain('sdkStandIn')
  })

  it('does not export the React hooks, so it loads in a Node test', () => {
    expect(Object.keys(client)).not.toContain('useRecoveryClient')
    expect(Object.keys(client)).not.toContain('useAccountFacts')
  })

  it('hands a screen no class or function of the SDK package', () => {
    const fromPackage = new Set<unknown>(
      Object.values(sdk).filter((value) => typeof value === 'function')
    )
    const leaked = Object.entries(client)
      .filter(([, value]) => typeof value === 'function' && fromPackage.has(value))
      .map(([name]) => name)
    expect(leaked).toEqual([])
  })
})
