import { CallbackOptions, Messenger } from '@ambire-common/interfaces/messenger'
import { bridgeMessenger } from '@web/extension-services/messengers/internal/bridge'

export enum RpcMethods {
  eth_chainId = 'eth_chainId',
  eth_accounts = 'eth_accounts',
  eth_sendTransaction = 'eth_sendTransaction',
  eth_signTransaction = 'eth_signTransaction',
  personal_sign = 'personal_sign',
  eth_signTypedData = 'eth_signTypedData',
  eth_signTypedData_v3 = 'eth_signTypedData_v3',
  eth_signTypedData_v4 = 'eth_signTypedData_v4',
  eth_getCode = 'eth_getCode',
  wallet_addEthereumChain = 'wallet_addEthereumChain',
  wallet_switchEthereumChain = 'wallet_switchEthereumChain',
  eth_requestAccounts = 'eth_requestAccounts',
  eth_blockNumber = 'eth_blockNumber',
  eth_call = 'eth_call',
  eth_estimateGas = 'eth_estimateGas',
  personal_ecRecover = 'personal_ecRecover',
  eth_gasPrice = 'eth_gasPrice',
  eth_getBlockByNumber = 'eth_getBlockByNumber',
  eth_getBalance = 'eth_getBalance',
  eth_getTransactionByHash = 'eth_getTransactionByHash',
  wallet_getCapabilities = 'wallet_getCapabilities',
  wallet_sendCalls = 'wallet_sendCalls',
  wallet_getCallsStatus = 'wallet_getCallsStatus',
  wallet_showCallsStatus = 'wallet_showCallsStatus',
  wallet_signAuthorization = 'wallet_signAuthorization'
}

export type RPCMethod = keyof typeof RpcMethods | string

export type RequestArguments = {
  method: RPCMethod
  params?: Array<any> | { [key: string]: any }
}
export type RequestResponse =
  | {
      id: number
      error: Error
      result?: never
    }
  | {
      id: number
      error?: never
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result: any
    }
  | undefined
  | boolean

export type ProviderRequestPayload = RequestArguments & {
  id: number
  meta?: CallbackOptions
}
type ProviderResponse = RequestResponse

/**
 * Creates a generic transport that can be used to send and receive messages between extension scripts
 * under a given topic & set of types.
 */
export function createTransport<TPayload, TResponse>({
  messenger,
  topic
}: {
  messenger: Messenger
  topic: string
}) {
  if (!messenger.available) {
    console.error(`Messenger "${messenger.name}" is not available in this context.`)
  }
  return {
    async send(payload: TPayload, { id }: { id: number }) {
      return messenger.send<TPayload, TResponse>(topic, payload, { id })
    },
    async reply(
      callback: (payload: TPayload, callbackOptions: CallbackOptions) => Promise<TResponse>
    ) {
      messenger.reply(topic, callback)
    }
  }
}

/**
 * Creates a transport that can be used to send and receive RPC messages between
 * extension scripts (commonly inpage <-> background entries).
 */
export const providerRequestTransport = createTransport<ProviderRequestPayload, ProviderResponse>({
  messenger: bridgeMessenger,
  topic: 'ambireProviderRequest'
})
