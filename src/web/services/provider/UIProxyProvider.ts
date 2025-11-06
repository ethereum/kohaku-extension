/* eslint-disable no-underscore-dangle */
/* eslint-disable max-classes-per-file */
import { Eip1193Provider } from 'ethers'
import { v4 as uuidv4 } from 'uuid'

import { RPCProvider } from '@ambire-common/interfaces/provider'
import { BrowserProvider } from '@ambire-common/services/provider/BrowserProvider'
import eventBus from '@web/extension-services/event/eventBus'

type PendingRequest = {
  resolve: (value: any) => void
  reject: (reason: any) => void
}

class ProxyEip1193Provider implements Eip1193Provider {
  private chainId: bigint

  private dispatch: (action: any) => void

  private pendingRequests: Map<string, PendingRequest> = new Map()

  private eventBusListener: ((params: any) => void) | null = null

  constructor(chainId: bigint, dispatch: (action: any) => void) {
    this.chainId = chainId
    this.dispatch = dispatch

    // Set up listener for responses from background
    this.eventBusListener = (params: any) => {
      const { requestId, result, error } = params
      const pending = this.pendingRequests.get(requestId)

      if (pending) {
        this.pendingRequests.delete(requestId)
        if (error) {
          pending.reject(new Error(error.message))
        } else {
          pending.resolve(result)
        }
      }
    }

    eventBus.addEventListener('PROVIDER_RPC_RESPONSE', this.eventBusListener)
  }

  async request(request: { method: string; params?: any[] }): Promise<any> {
    const requestId = uuidv4()

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject })

      this.dispatch({
        type: 'PROVIDER_RPC_REQUEST',
        params: {
          requestId,
          chainId: this.chainId,
          method: request.method,
          params: request.params || []
        }
      })
    })
  }

  destroy(): void {
    // Remove event listener
    if (this.eventBusListener) {
      eventBus.removeEventListener('PROVIDER_RPC_RESPONSE', this.eventBusListener)
      this.eventBusListener = null
    }

    // Reject all pending requests
    const error = new Error('Provider destroyed')
    this.pendingRequests.forEach((pending) => {
      pending.reject(error)
    })
    this.pendingRequests.clear()
  }
}

export class UIProxyProvider extends BrowserProvider implements RPCProvider {
  private proxyProvider: ProxyEip1193Provider

  constructor(chainId: bigint, rpcUrl: string, dispatch: (action: any) => void) {
    const proxyProvider = new ProxyEip1193Provider(chainId, dispatch)
    super(proxyProvider, rpcUrl)
    this.proxyProvider = proxyProvider
  }

  destroy(): void {
    // Destroy the proxy provider
    this.proxyProvider.destroy()

    // Call parent destroy
    super.destroy()
  }
}
