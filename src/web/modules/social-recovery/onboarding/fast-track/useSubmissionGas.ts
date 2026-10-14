/**
 * The fast track's gas check for the submission, kept current while the step
 * shows. It reads over the extension's own provider for the one chain this
 * build reads, and reads again every few seconds while the key holds too
 * little, so the step moves on by itself once the funds arrive. The deposit
 * step stays on screen between answered reads. A read that fails, or that
 * does not answer within its limit, stops the reads and shows as failed,
 * never as the last deposit step; retry starts them again.
 *
 * `key` and `network` are undefined while not known yet, which reads as
 * loading, and null where there is none, which reads as failed.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Network } from '@ambire-common/interfaces/network'
import type { Address } from '@web/modules/social-recovery/sdk-interfaces'
import type { ExtensionProvider } from '@web/modules/social-recovery/shared/client'
import { createChainReads, extensionProviderFor } from '@web/modules/social-recovery/shared/client'
import { providerKeyOf } from '@web/modules/social-recovery/shared/client/extension-provider'

import { BALANCE_POLL_MS, BALANCE_READ_LIMIT_MS } from './constants'
import { submissionCheckOf } from './gas'
import type { GasStepState, SubmissionGas } from './types'

const useSubmissionGas = (
  key: Address | null | undefined,
  network: Network | null | undefined
): SubmissionGas => {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<GasStepState>({ kind: 'loading' })
  const networkRef = useRef(network)
  networkRef.current = network
  const networkKey = network ? providerKeyOf(network) : network

  useEffect(() => {
    const current = networkRef.current
    if (key === undefined || networkKey === undefined) {
      setState({ kind: 'loading' })
      return undefined
    }
    if (key === null || !current) {
      setState({ kind: 'failed' })
      return undefined
    }
    let provider: ExtensionProvider
    try {
      provider = extensionProviderFor(current)
    } catch {
      setState({ kind: 'failed' })
      return undefined
    }
    const reads = createChainReads(provider)
    const fundedOn = { name: current.name, nativeAssetSymbol: current.nativeAssetSymbol }
    let live = true
    let next: ReturnType<typeof setTimeout> | undefined
    let bound: ReturnType<typeof setTimeout> | undefined

    const check = () => {
      bound = setTimeout(() => {
        if (live) {
          live = false
          setState({ kind: 'failed' })
        }
      }, BALANCE_READ_LIMIT_MS)
      submissionCheckOf({ reads, key, network: fundedOn })
        .finally(() => clearTimeout(bound))
        .then((result) => {
          if (!live) {
            return
          }
          if (result.kind === 'enough') {
            setState({ kind: 'enough' })
            return
          }
          setState({ kind: 'deposit', step: result.step })
          next = setTimeout(check, BALANCE_POLL_MS)
        })
        .catch(() => {
          if (live) {
            setState({ kind: 'failed' })
          }
        })
    }

    setState({ kind: 'loading' })
    check()
    return () => {
      live = false
      if (next) {
        clearTimeout(next)
      }
      if (bound) {
        clearTimeout(bound)
      }
      provider.destroy()
    }
  }, [key, networkKey, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return { state, retry }
}

export default useSubmissionGas
