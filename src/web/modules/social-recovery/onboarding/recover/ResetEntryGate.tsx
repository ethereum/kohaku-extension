/**
 * The warning in front of an entry the wallet already has, the password reset
 * and the seed import. The entry's own screen, with its fields and its
 * effects, mounts only after the holder acknowledged and pressed continue.
 */
import React, { useCallback, useState } from 'react'

import PlainChrome from '@web/modules/social-recovery/shared/chrome/PlainChrome'

import type { ResetEntryGateProps } from './types'
import WarningGate from './WarningGate'

const ResetEntryGate = ({ children, onLeave }: ResetEntryGateProps) => {
  const [passed, setPassed] = useState(false)
  const pass = useCallback(() => setPassed(true), [])

  if (passed) {
    return children
  }

  return (
    <PlainChrome testID="reset-entry-gate">
      <WarningGate form="reset" onContinue={pass} onLeave={onLeave} />
    </PlainChrome>
  )
}

export default ResetEntryGate
