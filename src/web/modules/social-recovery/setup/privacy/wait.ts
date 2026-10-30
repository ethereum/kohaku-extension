import type { SetupDraft } from '@kohaku-eth/social-recovery'

import type { CustomWait, WaitChip, WaitChoice } from './types'

/**
 * A test build sets `SOCIAL_RECOVERY_WAIT_FLOOR_MINUTES` in its `.env` to try a
 * recovery without a day's wait: the floor drops to that many minutes and the
 * custom entry counts minutes instead of hours. The switch only lowers the
 * floor: a value that is not a whole number of minutes above zero and below a
 * day is ignored, and the day's floor stands. A release build leaves it unset,
 * so the floor is a day and the entry counts hours.
 */
const RELEASE_FLOOR_HOURS = 24
const FLOOR_MINUTES = Number(process.env.SOCIAL_RECOVERY_WAIT_FLOOR_MINUTES)
const MINUTES_MODE =
  Number.isInteger(FLOOR_MINUTES) && FLOOR_MINUTES > 0 && FLOOR_MINUTES < RELEASE_FLOOR_HOURS * 60

/** Whether the custom entry counts minutes, as in a test build, rather than hours. */
export const CUSTOM_UNIT_IS_MINUTES = MINUTES_MODE

/** The seconds one unit of the custom entry counts: an hour, or a minute in a test build. */
export const CUSTOM_UNIT_SECONDS = MINUTES_MODE ? 60 : 3600

/** The shortest waiting period this wallet saves, in hours. The chain enforces no minimum. */
export const WAIT_FLOOR_HOURS = MINUTES_MODE ? FLOOR_MINUTES / 60 : RELEASE_FLOOR_HOURS

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

const SECONDS_PER_HOUR = 3600

export const secondsOfHours = (hours: number): SetupDraft['wait'] =>
  Math.round(hours * SECONDS_PER_HOUR)

/** The shortest waiting period this wallet saves, in seconds. */
export const WAIT_FLOOR_SECONDS = secondsOfHours(WAIT_FLOOR_HOURS)

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
  const hours = (Number(text) * CUSTOM_UNIT_SECONDS) / SECONDS_PER_HOUR
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

const DEFAULT_CHIP = WAIT_CHIPS[1]

/** The picker's state when no waiting period is stored: 48 hours. */
export const DEFAULT_CHOICE: WaitChoice = { kind: 'chip', id: DEFAULT_CHIP.id }

/** The length the picker holds when no waiting period is stored, in seconds. */
export const DEFAULT_WAIT_SECONDS = secondsOfHours(DEFAULT_CHIP.hours)

/**
 * The picker's state for a stored waiting period: its chip, or the custom
 * entry in its unit. A length the picker refuses, under the floor, past the
 * ceiling or not a whole number of units, goes into the custom entry as well,
 * so its refusal shows and continue stays held.
 */
export const choiceOfSeconds = (seconds: SetupDraft['wait']): WaitChoice => {
  const unit = CUSTOM_UNIT_SECONDS
  if (seconds % unit !== 0) {
    return { kind: 'custom', text: String(seconds / unit) }
  }
  const chip = WAIT_CHIPS.find((candidate) => candidate.hours * SECONDS_PER_HOUR === seconds)
  return chip ? { kind: 'chip', id: chip.id } : { kind: 'custom', text: String(seconds / unit) }
}
