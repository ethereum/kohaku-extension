/**
 * The three module reads a setup and the review's trust list make, over the
 * methods' views. A module whose view reverts answered: the read carries the
 * empty value, as a contract that declares nothing. A read the provider could
 * not make, or an answer that does not decode (an address with no code
 * answers no bytes), did not answer: `{ answered: false }`, never an empty
 * value.
 */
import { zeroAddress } from 'viem'

import type {
  Address,
  IMethodModuleReads,
  ModuleInfo,
  ReadResult,
  TrustedParties
} from '@web/modules/social-recovery/sdk-interfaces'

import { isRevertedCall } from '../../provider-adapter'
import type { MethodReads } from '../reads'
import { METHOD_INTERFACE_ID } from '../reads'

const NO_PARTIES: TrustedParties = {
  admin: zeroAddress,
  pendingAdmin: zeroAddress,
  trustedKeys: [],
  pauseHolder: zeroAddress,
  pendingPauseHolder: zeroAddress
}

const UNANSWERED = { answered: false } as const

const answeredOr = async <T>(read: () => Promise<T>, onRevert: T): Promise<ReadResult<T>> => {
  try {
    return { answered: true, value: await read() }
  } catch (thrown: unknown) {
    return isRevertedCall(thrown) ? { answered: true, value: onRevert } : UNANSWERED
  }
}

export const moduleReadsOf = (reads: MethodReads): IMethodModuleReads => ({
  async moduleInfo(module: Address): Promise<ReadResult<ModuleInfo>> {
    const [name, version, supportsInterface] = await Promise.all([
      answeredOr(() => reads.name(module), ''),
      answeredOr(() => reads.version(module), ''),
      answeredOr(() => reads.supportsInterface(module, METHOD_INTERFACE_ID), false)
    ])
    if (!name.answered || !version.answered || !supportsInterface.answered) {
      return UNANSWERED
    }
    return {
      answered: true,
      value: {
        name: name.value,
        version: version.value,
        supportsInterface: supportsInterface.value
      }
    }
  },

  async paused(module: Address): Promise<ReadResult<boolean>> {
    try {
      return { answered: true, value: await reads.paused(module) }
    } catch {
      return UNANSWERED
    }
  },

  trustedParties(module: Address): Promise<ReadResult<TrustedParties>> {
    return answeredOr(() => reads.trustedParties(module), { ...NO_PARTIES, trustedKeys: [] })
  }
})
