import React from 'react'

import DownArrowIcon from '@common/assets/svg/DownArrowIcon'
import UpArrowIcon from '@common/assets/svg/UpArrowIcon'
import Button from '@common/components/Button'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'

import KindMenuAnchor from './KindMenuAnchor'
import type { KindMenuButtonProps } from './types'

// The secondary button's hovered label colour; the icon only follows it while
// the pointer is over the button, so the open state names it.
const OPEN_ICON_COLOR = '#fff'

/**
 * A button that opens the kinds it can add, each one a single press away. While
 * the menu is open the button holds its hovered look at full strength, so a
 * press does not leave it faded.
 */
const KindMenuButton = ({
  text,
  open,
  kinds,
  onToggle,
  onPick,
  onClose,
  disabled,
  testID,
  style
}: KindMenuButtonProps) => (
  <KindMenuAnchor
    open={open}
    kinds={kinds}
    onPick={onPick}
    onClose={onClose}
    disabled={disabled}
    menuTestID={`${testID}-menu`}
    style={[flexbox.alignSelfStart, style]}
  >
    <Button
      testID={testID}
      type="secondary"
      size="small"
      text={text}
      onPress={onToggle}
      disabled={disabled}
      hasBottomSpacing={false}
      forceHoveredStyle={open}
      childrenContainerStyle={spacings.mlTy}
      // react-native-web renders these two as aria-haspopup and aria-expanded; the React Native
      // types do not declare them, so they travel in a spread
      {...{ accessibilityHasPopup: 'menu', accessibilityExpanded: open }}
      childrenPosition="right"
    >
      {open ? <UpArrowIcon color={OPEN_ICON_COLOR} /> : <DownArrowIcon />}
    </Button>
  </KindMenuAnchor>
)

export default React.memo(KindMenuButton)
