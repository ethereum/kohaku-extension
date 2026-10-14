import React from 'react'

import CredentialRow from './CredentialRow'
import KindMenuAnchor from './KindMenuAnchor'
import { ADD_KINDS } from './operations'
import type { SlotRowProps } from './types'

/**
 * One slot of the path. A press opens its method; an empty slot whose kind
 * the wallet cannot read opens the kinds under it instead.
 */
const SlotRow = ({
  clause,
  member,
  credential,
  addressBook,
  enrollments,
  checking,
  menu,
  onOpenSlot,
  onPickKind,
  onCloseMenu
}: SlotRowProps) => (
  <KindMenuAnchor
    open={menu?.place === 'slot' && menu.clause === clause && menu.member === member}
    kinds={ADD_KINDS}
    onPick={onPickKind}
    onClose={onCloseMenu}
    disabled={checking}
    menuTestID={`editor-slot-${clause}-${member}-menu`}
  >
    <CredentialRow
      credential={credential}
      addressBook={addressBook}
      enrollments={enrollments}
      onPress={() => onOpenSlot(clause, member)}
      disabled={checking}
      testID={`editor-slot-${clause}-${member}`}
    />
  </KindMenuAnchor>
)

export default React.memo(SlotRow)
