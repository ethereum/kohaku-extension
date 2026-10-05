import type { Address, BlockTag, Hex, IProvider } from '@web/modules/social-recovery/sdk-interfaces'

import { providerReadFailure } from '../../provider-adapter'

/**
 * One view call through the provider adapter, decoded. A revert rejects with
 * the adapter's `RevertedCall`, a failed read with its `ProviderReadFailure`,
 * and an answer the decoder refuses with a `ProviderReadFailure` of the call.
 */
export const viewOf = async <T>(
  provider: IProvider,
  to: Address,
  data: Hex,
  decode: (answer: Hex) => T,
  block: BlockTag = 'latest'
): Promise<T> => {
  const answer = await provider.call(to, data, undefined, block)
  try {
    return decode(answer)
  } catch (thrown) {
    throw providerReadFailure('call', thrown)
  }
}
