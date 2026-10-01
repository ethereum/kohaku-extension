/**
 * The guardian's address and its light advisory checks: the checksum of a
 * typed address, the name a resolver answers for, the code at the address and
 * whether the wallet's own seed derived it. No check holds the enrollment or
 * the save.
 */
import { useEffect, useMemo, useState } from 'react'
import { isAddress } from 'viem'

import type { Address } from '@web/modules/social-recovery/sdk-interfaces'

import {
  checkLinesOf,
  codeCheckOf,
  guardianAddressOf,
  guardianTargetOf,
  seedCheckOf
} from './guardian'
import type { GuardianCheckState, GuardianChecks, GuardianChecksInput, NameCheck } from './types'

/** How long the field rests before a name resolves. */
const RESOLVE_DELAY_MS = 400

const useGuardianChecks = ({
  value,
  enrollment,
  deps
}: GuardianChecksInput): GuardianCheckState => {
  const [nameCheck, setNameCheck] = useState<NameCheck | undefined>()
  const [code, setCode] = useState<'none' | 'contract' | undefined>()

  const target = useMemo(() => guardianTargetOf(value), [value])
  const { resolveName } = deps

  useEffect(() => {
    if (enrollment || target.kind !== 'name') {
      setNameCheck(undefined)
      return undefined
    }
    let live = true
    setNameCheck({ status: 'resolving' })
    const timer = setTimeout(() => {
      resolveName(target.name)
        .then((resolved) => {
          if (!live) {
            return
          }
          setNameCheck(
            isAddress(resolved, { strict: false })
              ? { status: 'resolved', name: target.name, address: resolved }
              : { status: 'unresolved' }
          )
        })
        .catch(() => {
          if (live) {
            setNameCheck({ status: 'unresolved' })
          }
        })
    }, RESOLVE_DELAY_MS)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [enrollment, target, resolveName])

  const enrolledAddress = useMemo(
    () => (enrollment ? guardianAddressOf(enrollment.credential.config) : undefined),
    [enrollment]
  )
  let address: Address | undefined
  if (enrollment) {
    address = enrolledAddress
  } else if (target.kind === 'address') {
    address = target.address
  } else if (nameCheck?.status === 'resolved') {
    address = nameCheck.address
  }

  useEffect(() => {
    setCode(undefined)
    if (!address || !deps.chain) {
      return undefined
    }
    let live = true
    deps.chain
      .readCode(address)
      .then((read) => {
        if (live) {
          setCode(codeCheckOf(read))
        }
      })
      // A read the node did not answer renders neither code line.
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [address, deps.chain])

  const checks: GuardianChecks = {
    ...(!enrollment && target.kind === 'address' ? { checksum: target.checksum } : {}),
    ...(!enrollment && nameCheck ? { name: nameCheck } : {}),
    ...(code ? { code } : {}),
    ...(address ? { seed: seedCheckOf(deps.keys, address) } : {})
  }

  return { nameCheck, address, checkLines: checkLinesOf(checks) }
}

export default useGuardianChecks
