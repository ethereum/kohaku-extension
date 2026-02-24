/* eslint-disable no-console */
import type {
  RailgunAccountKeys,
  RailgunAccountCache
} from '@ambire-common/controllers/railgun/railgun'

export class BackgroundService {
  private getLatestBgState: () => any

  private dispatch: any

  constructor(getLatestBgState: () => any, dispatch: any) {
    this.getLatestBgState = getLatestBgState
    this.dispatch = dispatch
  }

  fireBg(type: string, params?: any) {
    if (!this.dispatch) throw new Error('Background dispatch not available')
    // eslint-disable-next-line no-void
    void this.dispatch({ type: type as keyof typeof this.dispatch, params })
  }

  async waitForBgValue<T>(
    selector: (s: any) => T | undefined | null,
    { timeoutMs = 6000, intervalMs = 150 }: { timeoutMs?: number; intervalMs?: number } = {}
  ): Promise<T> {
    const start = Date.now()
    const immediate = selector(this.getLatestBgState())
    if (immediate !== undefined && immediate !== null) return immediate

    return new Promise<T>((resolve, reject) => {
      const timer = setInterval(() => {
        if (Date.now() - start > timeoutMs) {
          clearInterval(timer)
          reject(new Error('Timed out waiting for background value'))
          return
        }
        const v = selector(this.getLatestBgState())
        if (v !== undefined && v !== null) {
          clearInterval(timer)
          resolve(v)
        }
      }, intervalMs)
    })
  }

  async getDerivedKeysFromBg(index: number): Promise<RailgunAccountKeys> {
    const s = this.getLatestBgState()
    if (index === 0 && s.defaultRailgunKeys) return s.defaultRailgunKeys as RailgunAccountKeys
    if (s.derivedRailgunKeysByIndex?.[index]) {
      return s.derivedRailgunKeysByIndex[index] as RailgunAccountKeys
    }

    this.fireBg('RAILGUN_CONTROLLER_DERIVE_RAILGUN_KEYS', { index })
    return this.waitForBgValue<RailgunAccountKeys>((state) => {
      if (index === 0 && state.defaultRailgunKeys) return state.defaultRailgunKeys
      return state.derivedRailgunKeysByIndex ? state.derivedRailgunKeysByIndex[index] : undefined
    })
  }

  async getAccountCacheFromBg(
    zkAddress: string,
    chainId: number
  ): Promise<RailgunAccountCache | null> {
    const s = this.getLatestBgState()
    const last = s.lastFetchedRailgunAccountCache
    // Check if we have a cached value that matches (cache can be null if account doesn't exist yet)
    if (last && last.zkAddress === zkAddress && last.chainId === chainId) {
      // If cache is explicitly set (even if null), return it
      // This handles both cases: cache exists or cache is null (account not initialized)
      return last.cache as RailgunAccountCache | null
    }

    // No cached value found, fetch from storage
    this.fireBg('RAILGUN_CONTROLLER_GET_ACCOUNT_CACHE', { zkAddress, chainId })
    try {
      return await this.waitForBgValue<RailgunAccountCache | null>(
        (state) => {
          const lf = state.lastFetchedRailgunAccountCache
          if (!lf) return undefined
          if (lf.zkAddress === zkAddress && lf.chainId === chainId) {
            // Return the cache value (can be null if account doesn't exist)
            return lf.cache !== undefined ? lf.cache : undefined
          }
          return undefined
        },
        { timeoutMs: 10000, intervalMs: 150 } // Increased timeout for storage operations
      )
    } catch (err) {
      console.error('[RailgunContext] getAccountCacheFromBg timeout, returning null', err)
      // On timeout, return null to allow fresh initialization
      return null
    }
  }
}
