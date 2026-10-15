import { browser } from '@web/constants/browserapi'
import { BadgesController } from '@web/extension-services/background/controllers/badges'

jest.mock('@web/constants/browserapi', () => ({
  browser: {
    action: {
      setBadgeText: jest.fn(),
      setBadgeBackgroundColor: jest.fn()
    }
  }
}))

jest.mock('@web/extension-services/background/webapi/icon', () => ({
  setExtensionIcon: jest.fn()
}))

// The controller only subscribes to these; the counts under test are set directly.
const noUpdates = () => ({ onUpdate: jest.fn() })

const createController = () =>
  new BadgesController(
    {
      ...noUpdates(),
      requests: noUpdates(),
      keystore: noUpdates(),
      swapAndBridge: { ...noUpdates(), banners: [] },
      signAccountOp: null
    } as unknown as ConstructorParameters<typeof BadgesController>[0],
    {} as ConstructorParameters<typeof BadgesController>[1]
  )

const lastBadgeText = () => {
  const { calls } = (browser.action.setBadgeText as jest.Mock).mock
  return calls[calls.length - 1][0].text
}

describe('the recovery attempts on the extension badge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows the running recovery attempts on the badge', () => {
    const controller = createController()

    controller.recoveryAttemptsCount = 2

    expect(lastBadgeText()).toBe('2')
  })

  it('adds the recovery attempts to the other counted sources', () => {
    const controller = createController()

    controller.badgesCount = 3
    controller.swapAndBridgeBannersCount = 1
    controller.recoveryAttemptsCount = 2

    expect(lastBadgeText()).toBe('6')
    expect(controller.badgesCount).toBe(6)
  })

  it('removes the badge when the recovery attempts drop to zero', () => {
    const controller = createController()

    controller.recoveryAttemptsCount = 1
    controller.recoveryAttemptsCount = 0

    expect(lastBadgeText()).toBe('')
  })

  it('keeps the other sources on the badge when the recovery attempts drop to zero', () => {
    const controller = createController()

    controller.badgesCount = 1
    controller.recoveryAttemptsCount = 1
    controller.recoveryAttemptsCount = 0

    expect(lastBadgeText()).toBe('1')
  })

  it('reports the recovery attempts in the serialized state', () => {
    const controller = createController()

    controller.recoveryAttemptsCount = 2

    expect(controller.toJSON()).toMatchObject({ recoveryAttemptsCount: 2, badgesCount: 2 })
  })
})
