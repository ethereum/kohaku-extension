import React, { useRef } from 'react'
import { View } from 'react-native'

import KindMenu from './KindMenu'
import type { KindMenuAnchorNode, KindMenuAnchorProps } from './types'
import useCloseOnOutsidePress from './useCloseOnOutsidePress'

// A slot of no width: the menu overflows it to its own width, so the anchor
// keeps the control's width.
const MENU_SLOT = { width: 0 }

/**
 * A control and the kind menu it opens, right under it in the page's flow. The
 * menu takes its own width without widening the control or moving what sits
 * beside it. A press anywhere else closes the menu.
 */
const KindMenuAnchor = ({
  children,
  open,
  kinds,
  onPick,
  onClose,
  disabled,
  menuTestID,
  style
}: KindMenuAnchorProps) => {
  const anchor = useRef<KindMenuAnchorNode>(null)
  useCloseOnOutsidePress(anchor, open, onClose)

  return (
    <View ref={anchor} style={style}>
      {children}
      {open && (
        <View style={MENU_SLOT}>
          <KindMenu kinds={kinds} onPick={onPick} disabled={disabled} testID={menuTestID} />
        </View>
      )}
    </View>
  )
}

export default React.memo(KindMenuAnchor)
