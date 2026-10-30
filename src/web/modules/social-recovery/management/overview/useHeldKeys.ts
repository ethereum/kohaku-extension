/**
 * Every key this wallet's keystore holds, whichever account it was made for:
 * a recovery may hand an account to the key of another account of this same
 * wallet, which the account's own entry never lists. Undefined until the
 * keystore is read. The list is kept by content, so a keystore update that
 * names the same keys reads nothing again.
 */
import { useRef } from 'react'

import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'
import type { Address } from '@kohaku-eth/social-recovery'

export const useHeldKeys = (): readonly Address[] | undefined => {
  const { keys } = useKeystoreControllerState()
  const held = keys?.map((key) => key.addr as Address)
  const kept = useRef(held)
  if (held?.join(',') !== kept.current?.join(',')) {
    kept.current = held
  }
  return kept.current
}
