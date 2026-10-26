/** The waiting period helpers, loaded afresh by a test that sets the build's floor. */
export type WaitHelpers = typeof import('../wait')

/** The selected account as an external store a test can switch. */
export type SelectedAccountMock = {
  state: { account: { addr: string } | null }
  listeners: Set<() => void>
}

/** A case's name and the waiting period's length. */
export type LengthCase = [string, number]

/** A stored length the view refuses: the case's name, the length, the field's text and the line it shows. */
export type RefusedLengthCase = [string, number, string, string]
