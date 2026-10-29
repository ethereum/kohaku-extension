/**
 * @jest-environment jsdom
 */

import { mount } from '@web/modules/social-recovery/cancel/__fixtures__/mount'

jest.mock('@common/hooks/useNavigation', () => ({
  __esModule: true,
  default: () => ({ navigate: () => {} })
}))
jest.mock('@common/modules/dashboard/components/DepositStatusBanner/DepositStatusBanner', () => ({
  __esModule: true,
  default: () =>
    // eslint-disable-next-line global-require
    require('react').createElement('span', { 'data-testid': 'deposit-banner' }, 'deposit')
}))
jest.mock('@common/modules/dashboard/components/DashboardPages', () => ({
  __esModule: true,
  default: () =>
    // eslint-disable-next-line global-require
    require('react').createElement('span', { 'data-testid': 'public-pages' }, 'public')
}))
jest.mock('@web/modules/PPv1/screens/dashboard/components/DashboardPages', () => ({
  __esModule: true,
  default: () =>
    // eslint-disable-next-line global-require
    require('react').createElement('span', { 'data-testid': 'private-pages' }, 'private')
}))
jest.mock('@web/modules/social-recovery/recovery/checklist/HomeRecoveryBand', () => ({
  __esModule: true,
  default: () =>
    // eslint-disable-next-line global-require
    require('react').createElement('span', { 'data-testid': 'recovery-band' }, 'band')
}))

/* eslint-disable @typescript-eslint/no-var-requires, global-require */
const React: typeof import('react') = require('react')
const PageContentArea: typeof import('@web/modules/PPv1/screens/dashboard/screens/PageContentArea').default =
  require('@web/modules/PPv1/screens/dashboard/screens/PageContentArea').default
/* eslint-enable @typescript-eslint/no-var-requires, global-require */

describe('the main dashboard content', () => {
  const cases = [
    { name: 'the private view', activeView: 'private', loading: false, text: 'depositbandprivate' },
    { name: 'the public view', activeView: 'public', loading: false, text: 'depositbandpublic' },
    {
      name: 'the public view while its balances load',
      activeView: 'public',
      loading: true,
      text: 'depositband'
    }
  ] as const

  cases.forEach(({ name, activeView, loading, text }) => {
    it(`shows the recovery band once, after the deposit banner, in ${name}`, async () => {
      const mounted = await mount(
        React.createElement(PageContentArea, { activeView, isLoadingPublicBalances: loading })
      )
      expect(mounted.text()).toBe(text)
      expect(document.querySelectorAll('[data-testid="recovery-band"]')).toHaveLength(1)
      mounted.unmount()
    })
  })
})
