import type {
  Clause,
  Credential,
  Finding,
  ISetupClient,
  SetupDraft
} from '@web/modules/social-recovery/sdk-interfaces'
import type { AddressBook } from '@web/modules/social-recovery/shared/client'
import type {
  Enrollment,
  SetupRecords,
  SlotKind
} from '@web/modules/social-recovery/shared/records'
import type { RuleLine } from '@web/modules/social-recovery/shared/rule-lines'

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

/** One line of the rules panel. */
export type RulesPanelLine =
  | 'requiredAnswers'
  | 'enoughMembers'
  | 'thresholdAtLeastOne'
  | 'thresholdCeiling'
  | 'memberCeiling'
  | 'oneRowPerMethod'
  | 'atLeastOneMethod'
  | 'smallEnough'
  | 'zeroThresholdOwnRule'

/** Where one credential sits in the path: its clause and its place among the clause's members. */
export interface SlotPosition {
  clause: number
  member: number
}

/** The outcome of an operation that places a credential in the path. */
export type EditResult =
  | { status: 'applied'; clauses: Clause[]; at: SlotPosition }
  | { status: 'refused'; reason: 'duplicate' }

/** What a clause is on screen: a required row, or a group with its threshold. */
export type ClauseRole = 'required' | 'group'

/**
 * Where the member picker places what the holder picks; `second` joins the
 * path's one method in a group any one of the two recovers.
 */
export type PickerTarget =
  | { place: 'required' }
  | { place: 'second' }
  | { place: 'member'; clause: number }
  | ({ place: 'slot'; kind?: SlotKind } & SlotPosition)

/** One enrolled credential the picker lists, with whether the path already holds it. */
export interface PickerEntry {
  enrollment: Enrollment
  inPath: boolean
}

/**
 * The records the editor opened with, an absent draft opening the blank
 * editor, and the role each clause holds on screen while the holder edits.
 */
export interface EditorLoad {
  draft: SetupDraft
  enrollments: Enrollment[]
  mode: 'adjust' | 'build'
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

export interface EditorViewProps {
  /** The account's setup records: the draft, the path and the enrollments. */
  records: SetupRecords
  client: EditorClient
  addressBook: AddressBook
  /** Opens a route, with its search string where it carries one. */
  navigate: (to: string) => void
}

export interface MemberPickerProps {
  entries: Record<SlotKind, PickerEntry[]>
  /** The kinds the picker offers: every kind, or an empty slot's own. */
  kinds: readonly SlotKind[]
  addressBook: AddressBook
  onPick: (credential: Credential) => void
  onEnrollNew: (kind: SlotKind) => void
  onClose: () => void
  /** Holds every pick while the path check runs. */
  disabled?: boolean
}

export interface CredentialRowProps {
  credential: Credential
  addressBook: AddressBook
  enrollments: readonly Enrollment[]
  /** Opens the picker for an empty slot. */
  onPress?: () => void
  disabled?: boolean
  testID?: string
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

export interface EditorHeaderProps {
  mode: EditorLoad['mode']
  /** Whether the last pick was a credential the path already holds. */
  refused: boolean
}

export interface RequiredRowsProps {
  rows: IndexedClause[]
  groups: IndexedClause[]
  /** The index of the required row whose group chooser is open, when more than one group can take it. */
  rowChoosingGroup: number | null
  addressBook: AddressBook
  enrollments: readonly Enrollment[]
  checking: boolean
  onOpenSlot: (clause: number, member: number) => void
  onMove: (row: number, group: number) => void
  onOpenGroupChoice: (row: number) => void
  onCloseGroupChoice: () => void
  onRemove: (row: number) => void
  onAdd: () => void
}

export interface GroupListProps {
  groups: IndexedClause[]
  heldThresholds: HeldThresholds
  addressBook: AddressBook
  enrollments: readonly Enrollment[]
  checking: boolean
  onOpenSlot: (clause: number, member: number) => void
  onThresholdText: (group: number, text: string) => void
  onMakeRequired: (group: number, member: number) => void
  onRemoveMember: (group: number, member: number) => void
  onAddMember: (group: number) => void
  onRemoveGroup: (group: number) => void
  onAddGroup: () => void
}

export interface RuleLinesProps {
  ruleLines: RuleLine[]
  checking: boolean
  onMakeItAGroup: () => void
  onAddSecondMethod: () => void
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
}
