const DECIMALS_FOR_VERY_SMALL = 5 // < 0.0001
const DECIMALS_FOR_MEDIUM = 4 // 0.0001 - 99.99
const DECIMALS_FOR_LARGE = 2 // >= 100

const VERY_SMALL_THRESHOLD = 0.0001
const SMALL_THRESHOLD = 0.01
const LARGE_THRESHOLD = 100

/**
 * Formats a number or string amount to show a maximum of 5 decimals
 *
 * @param value - The value to format (number or string)
 * @returns Formatted string (max 5 decimals)
 */
export const formatAmount = (value: string | number): string => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value

  if (Number.isNaN(numValue) || !Number.isFinite(numValue) || numValue === 0) {
    return '0'
  }

  const absValue = Math.abs(numValue)

  const decimals =
    absValue < VERY_SMALL_THRESHOLD
      ? DECIMALS_FOR_VERY_SMALL
      : absValue < LARGE_THRESHOLD
      ? DECIMALS_FOR_MEDIUM
      : DECIMALS_FOR_LARGE

  const multiplier = 10 ** decimals
  const rounded =
    absValue < SMALL_THRESHOLD
      ? Math.ceil(numValue * multiplier) / multiplier
      : Math.round(numValue * multiplier) / multiplier

  return rounded.toFixed(decimals).replace(/\.?0+$/, '') || '0'
}
