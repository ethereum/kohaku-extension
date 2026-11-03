import type { Enrollment } from '@web/modules/social-recovery/shared/records'
import type { Clause, SetupDraft } from '@kohaku-eth/social-recovery'
import type { MountOptions } from '@web/modules/social-recovery/setup/review/__fixtures__/review'

/** The selected account as an external store a test can switch. */
export type SelectedAccountMock = {
  state: { account: { addr: string } | null }
  listeners: Set<() => void>
}

/** How many times the view mounted. */
export type MountCount = { count: number }

/** A test result, the label, and the chip and line it shows. */
export type VerdictCase = [Enrollment['test'], string | undefined, string, string | null]

/** A credential, its label, and the line its failed test shows. */
export type FailedLineCase = [Enrollment['credential'], string | undefined, string]

/** A test result and the lines it shows. */
export type UnfailedLineCase = [Enrollment['test'], string[]]

/** A case's name and the path. */
export type PathCase = [string, Clause[]]

/** A case's name, the block, how the view mounts, and the text each element shows. */
export type BlockedMountCase = [string, string, MountOptions, [string, string][]]

/** A waiting period and the chip it shows. */
export type ChipCase = [number, string]

/** A case's name, the credential, and its label. */
export type NeverWorkCase = [string, Enrollment['credential'], string | undefined]

/** The parts of a draft the lead reads: its privacy and its path. */
export type DraftShape = Pick<SetupDraft, 'privacy' | 'clauses'>
