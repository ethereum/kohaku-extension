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

  const decimals = absValue < 0.0001 ? 5 : absValue < 100 ? 4 : 2

  const multiplier = 10 ** decimals
  const rounded =
    absValue < 0.01
      ? Math.ceil(numValue * multiplier) / multiplier
      : Math.round(numValue * multiplier) / multiplier

  return rounded.toFixed(decimals).replace(/\.?0+$/, '') || '0'
}
