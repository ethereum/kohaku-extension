/**
 * @jest-environment jsdom
 */

import type { BannerStubProps } from '@web/modules/social-recovery/cancel/__fixtures__/types'

jest.mock('@web/modules/PPv1/screens/dashboard/hooks/useBanners', () => ({
  __esModule: true,
  default: () => [
    [
      { id: 'first', type: 'info' },
      { id: 'second', type: 'warning' }
    ]
  ]
}))
jest.mock(
  '@common/modules/dashboard/components/DashboardBanners/DashboardBanner/DashboardBanner',
  () => ({
    __esModule: true,
    default: ({ banner }: BannerStubProps) =>
      // eslint-disable-next-line global-require
      require('react').createElement(
        'span',
        { 'data-testid': `controller-${banner.id}` },
        banner.id
      )
  })
)
jest.mock('@web/modules/social-recovery/cancel/RecoveryAttemptBanner', () => ({
  __esModule: true,
  default: () =>
    // eslint-disable-next-line global-require
    require('react').createElement('span', { 'data-testid': 'recovery-banner' }, 'recovery')
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const fixtures: typeof import('@web/modules/social-recovery/cancel/__fixtures__/mount') = require('@web/modules/social-recovery/cancel/__fixtures__/mount')
const DashboardBanners: typeof import('@web/modules/PPv1/screens/dashboard/components/DashboardBanners/DashboardBanners').default =
  require('@web/modules/PPv1/screens/dashboard/components/DashboardBanners/DashboardBanners').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

describe('the main dashboard banners', () => {
  it('show the recovery banner once, above the wallet banners', async () => {
    const mounted = await fixtures.mount(React.createElement(DashboardBanners))
    expect(mounted.text()).toBe('recoveryfirstsecond')
    mounted.unmount()
  })
})
