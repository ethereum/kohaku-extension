import type { ReactNode } from 'react'
import type { StyleProp, View, ViewStyle } from 'react-native'

import type {
  Clause,
  Credential,
  Finding,
  ISetupClient,
  SETUP_ERROR_CODES,
  SetupDraft
} from '@kohaku-eth/social-recovery'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import type {
  Enrollment,
  SetupRecords,
  SlotKind,
  SlotPosition
} from '@web/modules/social-recovery/shared/records'
import type { RuleLine } from '@web/modules/social-recovery/shared/rule-lines'

/** The code of an error the SDK's setup check finds. */
export type SetupErrorCode = typeof SETUP_ERROR_CODES[number]

/** A shape this wallet refuses to save, named by its sentence. */
export type RefusalKey =
  | 'emptyGroup'
  | 'emptyGroupSlot'
  | 'emptyRequired'
  | 'thresholdAboveMembers'
  | 'thresholdBelowOne'
  | 'thresholdBelowOneOwnRule'
  | 'thresholdAboveField'
  | 'memberCeiling'
  | 'noMethod'
  | 'waitFieldWidth'
  | 'waitCeiling'
  | 'tooLarge'

/** One refusal of the draft: its sentence, and the clause it is about when it is about one. */
export interface Refusal {
  key: RefusalKey
  clause?: number
}

/** The outcome of an operation that places a credential in the path. */
export type EditResult =
  | { status: 'applied'; clauses: Clause[]; at: SlotPosition }
  | { status: 'refused'; reason: 'duplicate' }

/** What a clause is on screen: a required row, or a group with its threshold. */
export type ClauseRole = 'required' | 'group'

/**
 * Where a kind menu places the empty slot of the kind the holder picks: a new
 * required row, a new member of a group, an existing slot, or `second`, which
 * joins the path's one method in a group any one of the two recovers.
 */
export type AddTarget =
  | { place: 'required' }
  | { place: 'second' }
  | { place: 'member'; clause: number }
  | ({ place: 'slot' } & SlotPosition)

/**
 * The records the editor opened with, an absent draft opening the blank
 * editor, and the role each clause holds on screen while the holder edits.
 */
export interface EditorLoad {
  draft: SetupDraft
  enrollments: Enrollment[]
  roles: ClauseRole[]
}

/**
 * The client as the editor reads it: loading, ready with the path check, or
 * refused, because this wallet version cannot read the account's setup or
 * because the client could not be built.
 */
export type EditorClient =
  | { status: 'loading' }
  | { status: 'ready'; setup: Pick<ISetupClient, 'validateSetup'> }
  | { status: 'update-the-wallet'; retry: () => void }
  | { status: 'failed'; retry: () => void }

/** Why the editor cannot run the path check: an older wallet, or a kit it could not reach. */
export type ClientRefusal = 'update-the-wallet' | 'unavailable'

/** A member of a group by its place in the path: the clause, then the member. */
export type MemberKey = `${number}:${number}`

/** The heading over the path, in place of the setup's own. */
export interface EditorHeading {
  title: string
  lead: string
}

export interface EditorViewProps {
  /** The account's setup records: the draft, the path and the enrollments. */
  records: SetupRecords
  client: EditorClient
  addressBook: AddressBook
  /** Opens a route, with its search string where it carries one. */
  navigate: (to: string) => void
  /** Members the path cannot lose: each reads still needed and cannot be removed. */
  stillNeeded?: ReadonlySet<MemberKey>
  heading?: EditorHeading
  continueLabel?: string
  /** What sits between the path and its actions. */
  beforeActions?: ReactNode
}

export interface CredentialRowProps {
  credential: Credential
  addressBook: AddressBook
  enrollments: readonly Enrollment[]
  /**
   * Opens the row's method: an empty slot always, an enrolled credential when
   * its kind is known and the records hold its enrollment.
   */
  onPress?: () => void
  disabled?: boolean
  testID?: string
}

/** The element a kind menu wraps; on the web it is a DOM node, which a press outside it closes the menu by. */
export type KindMenuAnchorNode = View & Pick<HTMLElement, 'contains'>

export interface KindMenuProps {
  kinds: readonly SlotKind[]
  onPick: (kind: SlotKind) => void
  disabled?: boolean
  /** The menu's own test id; each kind's entry adds `-<kind>` to it. */
  testID: string
}

export interface KindMenuEntryProps {
  label: string
  onPress: () => void
  disabled?: boolean
  testID: string
}

export interface KindMenuAnchorProps {
  /** What opens the menu: a button, or a row. */
  children: ReactNode
  open: boolean
  kinds: readonly SlotKind[]
  onPick: (kind: SlotKind) => void
  onClose: () => void
  disabled?: boolean
  menuTestID: string
  style?: StyleProp<ViewStyle>
}

export interface KindMenuButtonProps {
  text: string
  open: boolean
  kinds: readonly SlotKind[]
  onToggle: () => void
  onPick: (kind: SlotKind) => void
  onClose: () => void
  disabled?: boolean
  /** The button's test id; its menu's is the same with `-menu` after it. */
  testID: string
  style?: StyleProp<ViewStyle>
}

/**
 * The text of each group's threshold field that does not read as a whole
 * number, by the group's clause index. A field whose text reads as one shows
 * the draft's threshold instead.
 */
export type HeldThresholds = Record<number, string>

export interface ThresholdFieldProps {
  threshold: number
  /** The text the field holds while it does not read as a whole number. */
  heldText?: string
  members: number
  onChangeText: (text: string) => void
  disabled?: boolean
  testID?: string
}

/** A clause of the path with its index among the draft's clauses. */
export interface IndexedClause {
  clause: Clause
  index: number
}

/**
 * How far the draft's slots are filled: no method yet, a slot still waiting
 * for its method, or every slot holding one.
 */
export type EditorFill = 'empty' | 'open' | 'filled'

export interface EditorHeaderProps {
  fill: EditorFill
  /** Whether the last move was refused because the path already holds the credential. */
  refused: boolean
  heading?: EditorHeading
}

/** What the path's rows and groups share: the records, the open menu and the slot actions. */
interface PathPartProps {
  addressBook: AddressBook
  enrollments: readonly Enrollment[]
  checking: boolean
  /** The kind menu open on screen, if any. */
  menu: AddTarget | null
  onOpenSlot: (clause: number, member: number) => void
  onPickKind: (kind: SlotKind) => void
  onCloseMenu: () => void
}

export interface SlotRowProps extends PathPartProps {
  clause: number
  member: number
  credential: Credential
}

export interface RequiredRowProps extends PathPartProps {
  row: IndexedClause
  groups: IndexedClause[]
  /** Whether this row's group chooser is open, when more than one group can take it. */
  choosingGroup: boolean
  onMove: (row: number, group: number) => void
  onOpenGroupChoice: (row: number) => void
  onCloseGroupChoice: () => void
  onRemove: (row: number) => void
}

export interface GroupCardProps extends PathPartProps {
  group: IndexedClause
  /** The group's place among the groups, from one. */
  ordinal: number
  heldText?: string
  onThresholdText: (group: number, text: string) => void
  onMakeRequired: (group: number, member: number) => void
  onRemoveMember: (group: number, member: number) => void
  /** Lowers the group's threshold by one and removes a member the path still needs, in one edit. */
  onLowerAndRemove: (group: number, member: number) => void
  onToggleMenu: (target: AddTarget) => void
  onRemoveGroup: (group: number) => void
  stillNeeded?: ReadonlySet<MemberKey>
}

export interface EditorPathProps extends PathPartProps {
  rows: IndexedClause[]
  groups: IndexedClause[]
  heldThresholds: HeldThresholds
  /** The index of the required row whose group chooser is open, when more than one group can take it. */
  rowChoosingGroup: number | null
  onMove: (row: number, group: number) => void
  onOpenGroupChoice: (row: number) => void
  onCloseGroupChoice: () => void
  onRemove: (row: number) => void
  onThresholdText: (group: number, text: string) => void
  onMakeRequired: (group: number, member: number) => void
  onRemoveMember: (group: number, member: number) => void
  onLowerAndRemove: (group: number, member: number) => void
  onToggleMenu: (target: AddTarget) => void
  onRemoveGroup: (group: number) => void
  onAddGroup: () => void
  /** Whether the path is one method, which "Add a second method" extends. */
  offersSecondMethod: boolean
  /** Whether the path is two required rows and no group, which "Make it a group" turns into one group. */
  canMakeItAGroup: boolean
  onMakeItAGroup: () => void
  stillNeeded?: ReadonlySet<MemberKey>
}

export interface RuleLinesProps {
  ruleLines: RuleLine[]
}

export interface RefusalListProps {
  refusals: Refusal[]
  /** The role of each clause, which heads a refusal with its clause's label. */
  roles: readonly ClauseRole[]
}

export interface EditorActionsProps {
  client: EditorClient
  clientRefusal: ClientRefusal | null
  /** The wallet's own refusals of the path at the last continue. */
  walletRefusals: Refusal[]
  roles: readonly ClauseRole[]
  findings: Finding[]
  methodCount: number
  checking: boolean
  checkFailed: boolean
  writeFailed: boolean
  /** Whether a threshold field holds text that is not a whole number. */
  thresholdHeld: boolean
  onRetryWrite: () => void
  onContinue: () => void
  onBack: () => void
  continueLabel?: string
}

export type { SlotPosition }
