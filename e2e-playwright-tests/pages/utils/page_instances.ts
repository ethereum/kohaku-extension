import BootstrapContext from 'interfaces/bootstrapContext'
import { AuthPage } from 'pages/authPage'
import { BasePage } from 'pages/basePage'
import { DashboardPage } from 'pages/dashboardPage'
import { GasTankPage } from 'pages/gasTankPage'
import { SettingsPage } from 'pages/settingsPage'
import { SignMessagePage } from 'pages/signMessagePage'
import { StabilityPage } from 'pages/stabilityPage'
import { SwapAndBridgePage } from 'pages/swapAndBridgePage'
import { TransferPage } from 'pages/transferPage'

import { bootstrap, bootstrapWithStorage } from '@helpers/bootstrap'

export class PageManager {
  basePage: BasePage

  auth: AuthPage

  gasTank: GasTankPage

  dashboard: DashboardPage

  settings: SettingsPage

  signMessage: SignMessagePage

  swapAndBridge: SwapAndBridgePage

  stability: StabilityPage

  transfer: TransferPage

  private initializePages(bootstrapContext: BootstrapContext): void {
    this.basePage = new BasePage(bootstrapContext)
    this.auth = new AuthPage(bootstrapContext)
    this.settings = new SettingsPage(bootstrapContext)
    this.gasTank = new GasTankPage(bootstrapContext)
    this.signMessage = new SignMessagePage(bootstrapContext)
    this.dashboard = new DashboardPage(bootstrapContext)
    this.swapAndBridge = new SwapAndBridgePage(bootstrapContext)
    this.transfer = new TransferPage(bootstrapContext)
    this.stability = new StabilityPage(bootstrapContext)
  }

  async initWithStorage(param: any, opts?: { shouldUnlockManually?: boolean }): Promise<void> {
    const { page, context, serviceWorker, extensionURL } = await bootstrapWithStorage(
      '',
      param,
      opts?.shouldUnlockManually ?? false
    )

    const bootstrapContext = { page, context, serviceWorker, extensionURL }

    this.initializePages(bootstrapContext)
  }

  async initWithoutStorage(): Promise<void> {
    const { page, context, extensionURL } = await bootstrap('')

    const bootstrapContext = {
      page,
      context,
      extensionURL
    }

    this.initializePages(bootstrapContext)
  }
}
