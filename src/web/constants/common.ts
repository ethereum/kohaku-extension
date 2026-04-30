import { isWeb } from '@common/config/env'

export const IS_CHROME = /Chrome\//i.test(global.navigator?.userAgent)

export const IS_FIREFOX = /Firefox\//i.test(global.navigator?.userAgent)

export const IS_LINUX = /linux/i.test(global.navigator?.userAgent)

export const IS_WINDOWS = /windows/i.test(global.navigator?.userAgent)

export const EVENTS = {
  broadcastToUI: 'broadcastToUI',
  broadcastToBackground: 'broadcastToBackground',
  TX_COMPLETED: 'TX_COMPLETED',
  SIGN_FINISHED: 'SIGN_FINISHED'
}

// eslint-disable-next-line no-restricted-globals
export const INTERNAL_REQUEST_ORIGIN = isWeb ? location.origin : null

export const INTERNAL_REQUEST_SESSION = {
  name: 'Ambire',
  origin: INTERNAL_REQUEST_ORIGIN,
  icon: '../assets/images/xicon@128.png'
}

export const SAFE_RPC_METHODS = [
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_coinbase',
  'eth_decrypt',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getBlockTransactionCountByHash',
  'eth_getBlockTransactionCountByNumber',
  'eth_getCode',
  'eth_getEncryptionPublicKey',
  'eth_getFilterChanges',
  'eth_getFilterLogs',
  'eth_getLogs',
  'eth_getProof',
  'eth_getStorageAt',
  'eth_getTransactionByBlockHashAndIndex',
  'eth_getTransactionByBlockNumberAndIndex',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_getUncleByBlockHashAndIndex',
  'eth_getUncleByBlockNumberAndIndex',
  'eth_getUncleCountByBlockHash',
  'eth_getUncleCountByBlockNumber',
  'eth_getWork',
  'eth_hashrate',
  'eth_mining',
  'eth_newBlockFilter',
  'eth_newFilter',
  'eth_newPendingTransactionFilter',
  'eth_protocolVersion',
  'eth_sendRawTransaction',
  'eth_sendTransaction',
  'eth_submitHashrate',
  'eth_submitWork',
  'eth_syncing',
  'eth_uninstallFilter',
  'wallet_requestPermissions',
  'wallet_getPermissions',
  'net_version',
  'wallet_getCapabilities',
  'wallet_sendCalls',
  'wallet_getCallsStatus',
  'wallet_showCallsStatus'
]

export const ETH_RPC_METHODS_AMBIRE_MUST_HANDLE = [
  'eth_chainId',
  'eth_getTransactionByHash',
  'eth_getEncryptionPublicKey',
  'eth_accounts',
  'eth_coinbase',
  'eth_requestAccounts',
  'eth_sendTransaction',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'wallet_getCapabilities',
  'wallet_sendCalls',
  'wallet_getCallsStatus',
  'wallet_showCallsStatus',
  'wallet_signAuthorization'
]
