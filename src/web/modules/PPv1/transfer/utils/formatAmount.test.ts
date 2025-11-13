import { formatAmount } from './formatAmount'

describe('formatAmount', () => {
  describe('Invalid inputs', () => {
    it('should return "0" for NaN', () => {
      expect(formatAmount(NaN)).toBe('0')
      expect(formatAmount('not a number' as any)).toBe('0')
    })

    it('should return "0" for Infinity', () => {
      expect(formatAmount(Infinity)).toBe('0')
      expect(formatAmount(-Infinity)).toBe('0')
    })

    it('should return "0" for zero', () => {
      expect(formatAmount(0)).toBe('0')
      expect(formatAmount('0')).toBe('0')
      expect(formatAmount(0.0)).toBe('0')
    })
  })

  describe('Very small numbers (< 0.0001) - 5 decimals, round up', () => {
    it('should format extremely small numbers with 5 decimals', () => {
      expect(formatAmount('0.000000005230000000000000532')).toBe('0.00001')
      expect(formatAmount(0.000000005230000000000000532)).toBe('0.00001')
    })

    it('should format numbers just below 0.0001', () => {
      expect(formatAmount(0.00009999)).toBe('0.0001')
      expect(formatAmount(0.00001513239383423)).toBe('0.00002')
      expect(formatAmount(0.000015)).toBe('0.00002')
    })

    it('should round up very small numbers', () => {
      expect(formatAmount(0.00000001)).toBe('0.00001')
      expect(formatAmount(0.00000999)).toBe('0.00001')
    })

    it('should handle boundary at 0.0001', () => {
      expect(formatAmount(0.00009)).toBe('0.00009')
      expect(formatAmount(0.0000999)).toBe('0.0001')
    })
  })

  describe('Small numbers (0.0001 <= x < 0.01) - 4 decimals, round up', () => {
    it('should format small numbers with 4 decimals', () => {
      expect(formatAmount('0.004200041')).toBe('0.0043')
      expect(formatAmount(0.004200041)).toBe('0.0043')
    })

    it('should format numbers just below 0.01', () => {
      expect(formatAmount(0.0099)).toBe('0.01') // rounds up with ceil
      expect(formatAmount(0.009999)).toBe('0.01')
    })

    it('should round up small numbers', () => {
      expect(formatAmount('0.0013991100205799')).toBe('0.0014')
      expect(formatAmount(0.001)).toBe('0.001')
      expect(formatAmount(0.00111)).toBe('0.0012')
    })

    it('should handle boundary at 0.0001', () => {
      expect(formatAmount(0.0001)).toBe('0.0001')
      expect(formatAmount(0.000101)).toBe('0.0002')
    })

    it('should handle boundary at 0.01', () => {
      expect(formatAmount(0.00999)).toBe('0.01')
      expect(formatAmount(0.009)).toBe('0.009')
    })
  })

  describe('Medium numbers (0.01 <= x < 100) - 4 decimals, standard rounding', () => {
    it('should format numbers between 0.01 and 1', () => {
      expect(formatAmount(0.01)).toBe('0.01')
      expect(formatAmount(0.5)).toBe('0.5')
      expect(formatAmount(0.9999)).toBe('0.9999')
    })

    it('should format numbers between 1 and 10', () => {
      expect(formatAmount('1.0032523')).toBe('1.0033')
      expect(formatAmount(1.0032523)).toBe('1.0033')
      expect(formatAmount('1.46')).toBe('1.46')
      expect(formatAmount(1.4)).toBe('1.4')
    })

    it('should format numbers between 10 and 100', () => {
      expect(formatAmount(10.123456)).toBe('10.1235')
      expect(formatAmount(50.5555)).toBe('50.5555')
      expect(formatAmount(99.999999)).toBe('100')
      expect(formatAmount(99.12345)).toBe('99.1235')
    })

    it('should use standard rounding (not round up)', () => {
      expect(formatAmount(1.00004)).toBe('1')
      expect(formatAmount(1.00005)).toBe('1.0001')
      expect(formatAmount(1.12344)).toBe('1.1234')
      expect(formatAmount(1.12345)).toBe('1.1235')
    })

    it('should remove trailing zeros', () => {
      expect(formatAmount(1.0)).toBe('1')
      expect(formatAmount(1.1)).toBe('1.1')
      expect(formatAmount(1.10)).toBe('1.1')
      expect(formatAmount(1.1000)).toBe('1.1')
      expect(formatAmount(10.0)).toBe('10')
    })
  })

  describe('Large numbers (>= 100) - 2 decimals, standard rounding', () => {
    it('should format numbers just at 100', () => {
      expect(formatAmount(100)).toBe('100')
      expect(formatAmount(100.123456789)).toBe('100.12')
    })

    it('should format hundreds', () => {
      expect(formatAmount(123.456)).toBe('123.46')
      expect(formatAmount(999.999)).toBe('1000')
    })

    it('should format thousands', () => {
      expect(formatAmount(1000.123456)).toBe('1000.12')
      expect(formatAmount(9999.99)).toBe('9999.99')
    })

    it('should format very large numbers', () => {
      expect(formatAmount(1000000.123456)).toBe('1000000.12')
      expect(formatAmount(999999999.999)).toBe('1000000000')
    })

    it('should use standard rounding', () => {
      expect(formatAmount(100.124)).toBe('100.12')
      expect(formatAmount(100.125)).toBe('100.13')
      expect(formatAmount(100.126)).toBe('100.13')
    })

    it('should remove trailing zeros', () => {
      expect(formatAmount(100.0)).toBe('100')
      expect(formatAmount(100.1)).toBe('100.1')
      expect(formatAmount(100.10)).toBe('100.1')
    })
  })

  describe('Boundary cases', () => {
    it('should handle boundary at 0.0001', () => {
      expect(formatAmount(0.00009999)).toBe('0.0001') // < 0.0001, rounds up to 5 decimals
      expect(formatAmount(0.0001)).toBe('0.0001') // >= 0.0001, uses 4 decimals
      expect(formatAmount(0.00010001)).toBe('0.0002') // >= 0.0001, rounds up with 4 decimals
    })

    it('should handle boundary at 0.01', () => {
      expect(formatAmount(0.009999)).toBe('0.01') // < 0.01, rounds up
      expect(formatAmount(0.01)).toBe('0.01') // >= 0.01, standard rounding
      expect(formatAmount(0.010001)).toBe('0.01') // >= 0.01, standard rounding
    })

    it('should handle boundary at 100', () => {
      expect(formatAmount(99.999999)).toBe('100') // < 100, 4 decimals
      expect(formatAmount(100)).toBe('100') // >= 100, 2 decimals
      expect(formatAmount(100.00001)).toBe('100') // >= 100, 2 decimals
    })
  })

  describe('Precision edge cases', () => {
    it('should handle floating point precision issues', () => {
      expect(formatAmount(0.1 + 0.2)).toBe('0.3')
      expect(formatAmount(0.3 - 0.2)).toBe('0.1')
    })

    it('should handle repeating decimals', () => {
      expect(formatAmount(1 / 3)).toBe('0.3333')
      expect(formatAmount(2 / 3)).toBe('0.6667')
      expect(formatAmount(1 / 6)).toBe('0.1667')
    })

    it('should handle very precise decimals', () => {
      expect(formatAmount(1.123456789123456789)).toBe('1.1235')
      expect(formatAmount(0.123456789123456789)).toBe('0.1235')
    })
  })
})

