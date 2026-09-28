/**
 * A screen imports `@web/modules/social-recovery/shared/client` and never the
 * doubles, so the swap to the real SDK touches one folder. The stand-in that
 * builds against the doubles and the React hook stay out of that barrel.
 */
import * as doubles from '@web/modules/social-recovery/sdk-doubles'
import * as client from '@web/modules/social-recovery/shared/client'

describe('the client barrel', () => {
  it('does not export the SDK stand-in', () => {
    expect(Object.keys(client)).not.toContain('sdkStandIn')
  })

  it('does not export the React hook, so it loads in a Node test', () => {
    expect(Object.keys(client)).not.toContain('useRecoveryClient')
  })

  it('hands a screen no class or function of the doubles', () => {
    const fromDoubles = new Set<unknown>(
      Object.values(doubles).filter((value) => typeof value === 'function')
    )
    const leaked = Object.entries(client)
      .filter(([, value]) => typeof value === 'function' && fromDoubles.has(value))
      .map(([name]) => name)
    expect(leaked).toEqual([])
  })
})
