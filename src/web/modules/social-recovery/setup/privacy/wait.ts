import type { SetupDraft } from '@web/modules/social-recovery/sdk-interfaces'

import type { CustomWait, WaitChip, WaitChoice } from './types'

/** The shortest waiting period this wallet saves. The chain enforces no minimum. */
export const WAIT_FLOOR_HOURS = 24

/**
 * The longest waiting period the picker accepts where the client names no
 * maximum wait: 30 days in hours, the SDK's shipped maximum. A placeholder
 * until the SDK fixes the value.
 */
export const PICKER_CEILING_HOURS = 30 * 24

/** The fixed chips of the picker with their lengths in hours, in the order they show. */
export const WAIT_CHIPS: readonly WaitChip[] = [
  { id: 'hours24', hours: 24 },
  { id: 'hours48', hours: 48 },
  { id: 'hours72', hours: 72 },
  { id: 'days7', hours: 7 * 24 }
]

const SECONDS_PER_HOUR = 3600n

export const secondsOfHours = (hours: number): SetupDraft['wait'] =>
  BigInt(hours) * SECONDS_PER_HOUR

/**
 * Reads the custom entry, which counts whole hours. An entry with anything but
 * digits is refused as not whole hours until it is, so a decimal or a unit
 * never turns into another length. The ceiling is checked before the floor.
 */
export const readCustomWait = (text: string, ceilingHours: number): CustomWait => {
  if (text === '') {
    return { status: 'empty' }
  }
  if (!/^[0-9]+$/.test(text)) {
    return { status: 'notWholeHours' }
  }
  const hours = Number(text)
  if (hours > ceilingHours) {
    return { status: 'pastCeiling' }
  }
  if (hours < WAIT_FLOOR_HOURS) {
    return { status: 'belowMinimum' }
  }
  return { status: 'accepted', hours }
}

/** Whether a chip is longer than the longest wait the picker accepts. */
export const isChipPastCeiling = (chip: WaitChip, ceilingHours: number): boolean =>
  chip.hours > ceilingHours

/**
 * The length the picker holds in hours, or undefined while the custom entry is
 * empty or refused, or while the chip held is past the ceiling.
 */
export const hoursOfChoice = (choice: WaitChoice, ceilingHours: number): number | undefined => {
  if (choice.kind === 'chip') {
    const chip = WAIT_CHIPS.find(({ id }) => id === choice.id)
    return chip && !isChipPastCeiling(chip, ceilingHours) ? chip.hours : undefined
  }
  const custom = readCustomWait(choice.text, ceilingHours)
  return custom.status === 'accepted' ? custom.hours : undefined
}

/** The picker's state when no waiting period is stored: 48 hours. */
export const DEFAULT_CHOICE: WaitChoice = { kind: 'chip', id: 'hours48' }

/**
 * The picker's state for a stored waiting period: its chip, or the custom
 * entry in hours. A length the picker refuses, under the floor, past the
 * ceiling or not a whole number of hours, goes into the custom entry as well,
 * so its refusal shows and continue stays held.
 */
export const choiceOfSeconds = (seconds: SetupDraft['wait']): WaitChoice => {
  if (seconds % SECONDS_PER_HOUR !== 0n) {
    return { kind: 'custom', text: String(Number(seconds) / Number(SECONDS_PER_HOUR)) }
  }
  const hours = seconds / SECONDS_PER_HOUR
  const chip = WAIT_CHIPS.find((candidate) => BigInt(candidate.hours) === hours)
  return chip ? { kind: 'chip', id: chip.id } : { kind: 'custom', text: String(hours) }
}
