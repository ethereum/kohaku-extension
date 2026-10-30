import {
  renderChip,
  renderHiddenValue,
  renderNoun,
  renderPasswordName,
  renderRemaining,
  renderValueLabel,
  renderWalletWord
} from '@web/modules/social-recovery/shared/display'

const HOUR = 60 * 60 * 1000

describe('a renderer called without a translate function', () => {
  it('renders the words of en.json, never a key', () => {
    expect(renderHiddenValue().chip).toBe('Hidden')
    expect(renderRemaining(2 * HOUR)).toBe('2 hours')
    expect(renderChip('attempt', 'executionDue')).toBe('Execution due')
    expect(renderNoun('guardian')).toBe('Guardian')
    expect(renderPasswordName('recoveryPassword')).toBe('Recovery password')
    expect(renderWalletWord('asThisWalletRead')).toBe('As this wallet read it.')
    expect(renderValueLabel('noPayment')).toBe('No payment')
  })
})
