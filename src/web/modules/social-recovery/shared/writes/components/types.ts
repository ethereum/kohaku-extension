import type { ReactNode } from 'react'

import type { DepositStep, WriteState } from '../types'

export interface WriteStateViewProps {
  state: WriteState
  /** The write's own title over the state, from its own keys. */
  title?: string
  /** The write's own sentence after the reading, from its own keys. */
  note?: string
  /** Runs the write again; the view shows the retry only where the state offers it. */
  onRetry?: () => void
  /** The write's own actions, under the state. */
  children?: ReactNode
  testID?: string
}

export interface DepositStepViewProps {
  step: DepositStep
  /** The key's latest balance while the step waits for the funds; the step's own by default. */
  balance?: bigint
  /** `step` renders the whole step; `blocker` the short panel that leads to it. */
  variant?: 'step' | 'blocker'
  /** Copies the key's address; the clipboard by default. */
  onCopy?: (address: string) => void
  /** The write's own actions. */
  children?: ReactNode
  testID?: string
}

export interface LinesProps {
  lines: string[]
  secondary?: boolean
}

/** The result of a copy to the clipboard, with the address it was started for. */
export interface CopyResult {
  address: string
  copied: boolean
}
