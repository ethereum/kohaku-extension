/**
 * The Jest module name mapper: a unit test under the module folder imports
 * through the tsconfig path aliases.
 */
import isInt from '@common/utils/isInt'
import underline2Camelcase from '@web/utils/underline2Camelcase'

describe('Jest path aliases', () => {
  it('resolves an import through @web/...', () => {
    expect(typeof underline2Camelcase).toBe('function')
    expect(underline2Camelcase('account_recovery')).toBe('accountRecovery')
  })

  it('resolves an import through @common/...', () => {
    expect(typeof isInt).toBe('function')
    expect(isInt(3)).toBe(true)
  })
})
