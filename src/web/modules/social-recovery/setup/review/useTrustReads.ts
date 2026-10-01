/**
 * Runs the two declaration reads of every method of the path through the
 * client's module reads, and runs again the ones that did not answer on
 * request. A read that rejects did not answer; it is never read as empty.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Address, IMethodModuleReads } from '@web/modules/social-recovery/sdk-interfaces'

import { readKeyOf } from './trust'
import { TRUST_READ_NAMES } from './constants'
import type { MethodReads, TrustReadName, TrustReads, TrustReadsState } from './types'

const UNANSWERED = { answered: false } as const

const withoutReads = (
  held: MethodReads | undefined,
  names: readonly TrustReadName[]
): MethodReads => {
  const next: MethodReads = { ...held }
  names.forEach((name) => {
    delete next[name]
  })
  return next
}

export const useTrustReads = (
  moduleReads: IMethodModuleReads | null,
  methods: readonly Address[]
): TrustReadsState => {
  const [reads, setReads] = useState<TrustReads>({})
  const readsRef = useRef<TrustReads>({})
  readsRef.current = reads
  // Each change of the client or of the methods starts a new round; an answer
  // from an earlier round lands nowhere.
  const round = useRef(0)
  const methodsKey = methods.map(readKeyOf).join(',')

  const run = useCallback(
    (method: Address, names: readonly TrustReadName[], at: number) => {
      if (!moduleReads) {
        return
      }
      const key = readKeyOf(method)
      setReads((held) => ({ ...held, [key]: withoutReads(held[key], names) }))
      const land = (update: (held: MethodReads | undefined) => MethodReads) => {
        if (round.current !== at) {
          return
        }
        setReads((held) => ({ ...held, [key]: update(held[key]) }))
      }
      if (names.includes('trustedParties')) {
        moduleReads.trustedParties(method).then(
          (result) => land((held) => ({ ...held, trustedParties: result })),
          () => land((held) => ({ ...held, trustedParties: UNANSWERED }))
        )
      }
      if (names.includes('moduleInfo')) {
        moduleReads.moduleInfo(method).then(
          (result) => land((held) => ({ ...held, moduleInfo: result })),
          () => land((held) => ({ ...held, moduleInfo: UNANSWERED }))
        )
      }
    },
    [moduleReads]
  )

  useEffect(() => {
    round.current += 1
    const at = round.current
    setReads({})
    methods.forEach((method) => run(method, TRUST_READ_NAMES, at))
    return () => {
      round.current += 1
    }
    // The methods are keyed by their addresses, so a new array of the same methods reads nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, methodsKey])

  const retry = useCallback(
    (method: Address) => {
      const held = readsRef.current[readKeyOf(method)]
      const names = TRUST_READ_NAMES.filter((name) => held?.[name]?.answered === false)
      if (names.length > 0) {
        run(method, names, round.current)
      }
    },
    [run]
  )

  return { reads, retry }
}
