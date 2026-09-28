/**
 * The social recovery routes: the ten WEB_ROUTES keys and their paths, one
 * routesConfig entry per path with the feature name as its title, and no path
 * shared with a route outside the module.
 *
 * routesConfig is keyed by the route PATH, like every existing entry
 * (`[ROUTES.x]: { route: ROUTES.x, ... }`), so an entry is looked up as
 * config[WEB_ROUTES[key]].
 */
import routesConfig from '@common/modules/router/config/routesConfig/routesConfig'
import { WEB_ROUTES } from '@common/modules/router/constants/common'

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
  socialRecoveryManage: 'social-recovery/manage'
}

type Entry = { route: string; title: string; name: string; withTitlePrefix?: boolean }

const webRoutes = WEB_ROUTES as unknown as Record<string, string>
const config = routesConfig as unknown as Record<string, Entry>

const socialRecoveryKeys = Object.keys(webRoutes).filter((key) => key.startsWith('socialRecovery'))

describe('social recovery routes', () => {
  it('declares the ten social recovery keys with their paths', () => {
    Object.entries(EXPECTED_ROUTES).forEach(([key, path]) => {
      expect({ key, path: webRoutes[key] }).toEqual({ key, path })
    })
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
})
