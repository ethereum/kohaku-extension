import { MainController } from '@ambire-common/controllers/main/main'
import ThemeColors from '@common/styles/themeConfig'
import { browser } from '@web/constants/browserapi'
import { setExtensionIcon } from '@web/extension-services/background/webapi/icon'

import { WalletStateController } from './wallet-state'

export class BadgesController {
  #mainCtrl: MainController

  #walletStateCtrl: WalletStateController

  #swapAndBridgeBannersCount: number = 0

  #recoveryAttemptsCount: number = 0

  #badgesCount: number = 0

  #icon: 'default' | 'locked' | null = null

  get badgesCount() {
    return this.#badgesCount + this.swapAndBridgeBannersCount + this.recoveryAttemptsCount
  }

  set badgesCount(newValue: number) {
    this.#badgesCount = newValue
    this.setBadges(this.badgesCount)
  }

  get swapAndBridgeBannersCount() {
    return this.#swapAndBridgeBannersCount
  }

  set swapAndBridgeBannersCount(newValue: number) {
    this.#swapAndBridgeBannersCount = newValue
    this.setBadges(this.badgesCount)
  }

  get recoveryAttemptsCount() {
    return this.#recoveryAttemptsCount
  }

  set recoveryAttemptsCount(newValue: number) {
    this.#recoveryAttemptsCount = newValue
    this.setBadges(this.badgesCount)
  }

  constructor(mainCtrl: MainController, walletStateCtrl: WalletStateController) {
    this.#mainCtrl = mainCtrl
    this.#walletStateCtrl = walletStateCtrl

    this.#mainCtrl.onUpdate(() => {
      const swapAndBridgeBannersCount = this.#mainCtrl.swapAndBridge.banners.filter(
        (b) => b.category === 'bridge-ready'
      ).length

      this.swapAndBridgeBannersCount =
        this.#mainCtrl.signAccountOp && !!swapAndBridgeBannersCount
          ? swapAndBridgeBannersCount - 1
          : swapAndBridgeBannersCount
    })

    this.#mainCtrl.requests.onUpdate(() => {
      this.badgesCount = this.#mainCtrl.requests.actions.visibleActionsQueue.filter(
        (a) => a.type !== 'benzin' && a.type !== 'swapAndBridge' && a.type !== 'transfer'
      ).length
    })

    this.#mainCtrl.keystore.onUpdate(() => {
      if (
        mainCtrl.keystore.hasPasswordSecret &&
        !mainCtrl.keystore.isUnlocked &&
        (!this.#icon || this.#icon === 'default')
      ) {
        this.#icon = 'locked'
        setExtensionIcon('locked')
      }

      if (mainCtrl.keystore.isUnlocked && (!this.#icon || this.#icon === 'locked')) {
        this.#icon = 'default'
        setExtensionIcon('default')
      }
    })

    this.#mainCtrl.swapAndBridge.onUpdate(() => {
      const swapAndBridgeBannersCount = this.#mainCtrl.swapAndBridge.banners.filter(
        (b) => b.category === 'bridge-ready'
      ).length

      this.swapAndBridgeBannersCount =
        this.#mainCtrl.signAccountOp && !!swapAndBridgeBannersCount
          ? swapAndBridgeBannersCount - 1
          : swapAndBridgeBannersCount
    })
  }

  setBadges = (badgesCount: number) => {
    try {
      if (badgesCount <= 0) {
        browser.action.setBadgeText({ text: '' })
      } else {
        browser.action.setBadgeText({ text: `${badgesCount}` })
        browser.action.setBadgeBackgroundColor({ color: ThemeColors.successDecorative.light })
      }
    } catch (error) {
      console.error(error)
    }
  }

  toJSON() {
    return {
      ...this,
      badgesCount: this.badgesCount,
      swapAndBridgeBannersCount: this.swapAndBridgeBannersCount,
      recoveryAttemptsCount: this.recoveryAttemptsCount
    }
  }
}
