/**
 * What a batch the smart account runs on itself needs beside its calls: the
 * recovery kit's mark on the request that arms the kit, and the transaction the
 * account's key sends for it, which the gas check estimates.
 */
import { getBaseAccount } from '@ambire-common/libs/account/getBaseAccount'
import type { AccountOp } from '@ambire-common/libs/accountOp/accountOp'
import type {
  Address,
  DeploymentDescriptor,
  PreparedCall
} from '@web/modules/social-recovery/sdk-interfaces'

import type { AccountBatchSource, GasEstimateCall, KeyHandle, RecoveryKitMark } from './types'

/** The recovery kit's mark of a deployment: its manager and its audited actions. */
export const recoveryKitMarkOf = (descriptor: DeploymentDescriptor): RecoveryKitMark => ({
  manager: descriptor.manager,
  auditedActions: [...descriptor.auditedActions]
})

/**
 * The transaction the key sends to run the calls, in order, as one operation
 * of the account, as the account library builds it for the account's state on
 * the chain. An account with code runs them through its own
 * `executeBySender`, sent to the account. An account with no code yet is
 * deployed by its factory in the same transaction (`deployAndExecute` with the
 * account's bytecode and salt), sent to the factory its creation record names.
 * Throws a TypeError for a basic account, which runs no batch.
 */
export const accountBatchTransactionOf = (
  source: AccountBatchSource,
  key: KeyHandle,
  calls: readonly PreparedCall[]
): GasEstimateCall => {
  const { account, state, network } = source
  if (!account.creation) {
    throw new TypeError(
      `The account ${account.addr} is a basic account, whose calls the wallet sends as separate transactions.`
    )
  }
  const operation: AccountOp = {
    accountAddr: account.addr,
    chainId: network.chainId,
    signingKeyAddr: key.addr,
    signingKeyType: key.type,
    nonce: state.nonce,
    calls: calls.map((call) => ({ to: call.target, value: call.value, data: call.data })),
    gasLimit: null,
    signature: null,
    gasFeePayment: null,
    accountOpToExecuteBefore: null
  }
  // The keystore's keys only decide the class of a basic account, refused above.
  const data = getBaseAccount(account, state, [], network).getBroadcastCalldata(operation)
  return {
    from: key.addr,
    to: (state.isDeployed ? account.addr : account.creation.factoryAddr) as Address,
    data
  }
}
