/**
 * @jest-environment jsdom
 *
 * The social recovery routes: the twenty-six WEB_ROUTES keys and their paths,
 * one routesConfig entry per path with the feature name as its title, a name
 * of its own for each step of the recover flow, no path shared with a route
 * outside the module, and the settings sidebar's entry that opens the setup.
 *
 * The settings sidebar reads `location` while it loads, so the suite runs in
 * jsdom. Its list of links is plain data; the two hooks its component body
 * uses pull in the background controllers and an untranspiled keyboard
 * package, so they are replaced by empty modules and never run here.
 *
 * routesConfig is keyed by the route PATH, like every existing entry
 * (`[ROUTES.x]: { route: ROUTES.x, ... }`), so an entry is looked up as
 * config[WEB_ROUTES[key]].
 */
import routesConfig from '@common/modules/router/config/routesConfig/routesConfig'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import { SETTINGS_LINKS } from '@web/modules/settings/components/Sidebar/Sidebar'
import type { RouteEntry } from '@web/modules/social-recovery/__tests__/stubs/types'

jest.mock('@web/hooks/useKeystoreControllerState', () => ({ __esModule: true, default: jest.fn() }))
jest.mock('@common/components/ScrollableWrapper', () => ({ __esModule: true, default: jest.fn() }))

// routesConfig imports `Platform` from react-native; jest.config.js maps
// react-native to react-native-web, so no mock is needed here.

// The feature name, the title of every social recovery route.
const FEATURE_NAME = 'Account recovery'

const EXPECTED_ROUTES: Record<string, string> = {
  socialRecovery: 'social-recovery',
  socialRecoveryCeremony: 'social-recovery/ceremony',
  socialRecoverySetup: 'social-recovery/setup',
  socialRecoveryCreate: 'social-recovery/create',
  socialRecoveryRecover: 'social-recovery/recover',
  socialRecoveryFastTrack: 'social-recovery/fast-track',
  socialRecoveryRecovery: 'social-recovery/recovery',
  socialRecoveryApprove: 'social-recovery/approve',
  socialRecoveryCancel: 'social-recovery/cancel',
  socialRecoveryManage: 'social-recovery/manage',
  socialRecoverySetupEditor: 'social-recovery/setup/editor',
  socialRecoverySetupEnroll: 'social-recovery/setup/enroll',
  socialRecoverySetupWaitingPeriod: 'social-recovery/setup/waiting-period',
  socialRecoverySetupPrivacy: 'social-recovery/setup/privacy',
  socialRecoverySetupReview: 'social-recovery/setup/review',
  socialRecoverySetupSave: 'social-recovery/setup/save',
  socialRecoverySetupCard: 'social-recovery/setup/card',
  socialRecoveryFastTrackKey: 'social-recovery/fast-track/key',
  socialRecoveryFastTrackGas: 'social-recovery/fast-track/gas',
  socialRecoveryRecoveryAccount: 'social-recovery/recovery/account',
  socialRecoveryRecoveryReadout: 'social-recovery/recovery/readout',
  socialRecoveryRecoveryChecklist: 'social-recovery/recovery/checklist',
  socialRecoveryRecoveryInProgress: 'social-recovery/recovery/in-progress',
  socialRecoveryRecoverySubmit: 'social-recovery/recovery/submit',
  socialRecoveryRecoveryWait: 'social-recovery/recovery/wait',
  socialRecoveryRecoveryDone: 'social-recovery/recovery/done'
}

// The recover flow's steps after its warning, each a screen of its own, so
// each carries a name no other route shows. The module's earlier entries share
// the feature name or the door's name on purpose.
const RECOVER_FLOW_STEPS = [
  'socialRecoveryFastTrackKey',
  'socialRecoveryFastTrackGas',
  'socialRecoveryRecoveryAccount',
  'socialRecoveryRecoveryReadout',
  'socialRecoveryRecoveryChecklist',
  'socialRecoveryRecoveryInProgress',
  'socialRecoveryRecoverySubmit',
  'socialRecoveryRecoveryWait',
  'socialRecoveryRecoveryDone'
]

const webRoutes = WEB_ROUTES as unknown as Record<string, string>
const config = routesConfig as unknown as Record<string, RouteEntry>

const socialRecoveryKeys = Object.keys(webRoutes).filter((key) => key.startsWith('socialRecovery'))

describe('social recovery routes', () => {
  it('declares the twenty-six social recovery keys with their paths', () => {
    Object.entries(EXPECTED_ROUTES).forEach(([key, path]) => {
      expect({ key, path: webRoutes[key] }).toEqual({ key, path })
    })
    expect([...socialRecoveryKeys].sort()).toEqual(Object.keys(EXPECTED_ROUTES).sort())
  })

  socialRecoveryKeys.forEach((key) =>
    it(`${key} has a routesConfig entry keyed by its path`, () => {
      const path = webRoutes[key]
      const entry = config[path]
      expect(entry).toBeDefined()
      expect(entry.route).toBe(path)
      expect(entry.name).toEqual(expect.any(String))
      expect(entry.name.length).toBeGreaterThan(0)
    })
  )

  socialRecoveryKeys.forEach((key) =>
    it(`${key} entry resolves its title to the feature name`, () => {
      const entry = config[webRoutes[key]]
      expect(entry).toBeDefined()
      // i18n.t returns the key itself when the key is missing from en.json,
      // so this also proves the title key resolves.
      expect(entry.title).toBe(FEATURE_NAME)
    })
  )

  socialRecoveryKeys.forEach((key) =>
    it(`${key} entry name resolves to a string, not an i18n key`, () => {
      const entry = config[webRoutes[key]]
      expect(entry).toBeDefined()
      expect(entry.name.startsWith('socialRecovery.')).toBe(false)
    })
  )

  socialRecoveryKeys.forEach((key) =>
    it(`${key} path starts with social-recovery`, () => {
      expect(webRoutes[key].startsWith('social-recovery')).toBe(true)
    })
  )

  it('names each step of the recover flow apart from every other route of the module', () => {
    const names = socialRecoveryKeys.map((key) => ({ key, name: config[webRoutes[key]]?.name }))
    const shared = RECOVER_FLOW_STEPS.filter((key) => {
      const own = config[webRoutes[key]]?.name
      return names.some((other) => other.key !== key && other.name === own)
    })
    expect(shared).toEqual([])
  })

  it('uses unique paths', () => {
    const paths = socialRecoveryKeys.map((key) => webRoutes[key])
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('shares no path with a route outside the module', () => {
    const others = Object.keys(webRoutes)
      .filter((key) => !key.startsWith('socialRecovery'))
      .map((key) => webRoutes[key])
    const clashes = socialRecoveryKeys.filter((key) => others.includes(webRoutes[key]))
    expect(clashes).toEqual([])
  })

  it('offers exactly one settings sidebar entry, named for the feature, and it opens the setup', () => {
    const entries = SETTINGS_LINKS.filter(({ path }) => path.startsWith('social-recovery'))
    expect(entries.map(({ path, label }) => ({ path, label }))).toEqual([
      { path: WEB_ROUTES.socialRecoverySetup, label: FEATURE_NAME }
    ])
  })
})
