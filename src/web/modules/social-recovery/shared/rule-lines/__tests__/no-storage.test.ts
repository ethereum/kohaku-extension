/**
 * The rule lines are pure, so loading them never loads the extension's
 * storage: a screen or a test may read a path's lines with no browser storage
 * present.
 */
jest.mock('@web/constants/browserapi', () => {
  throw new Error('the rule lines loaded the extension storage')
})
jest.mock('@web/extension-services/background/webapi/storage', () => {
  throw new Error('the rule lines loaded the extension storage')
})

describe('the rule lines load without the extension storage', () => {
  it('reads the lines of a path of slots with the storage modules unloadable', () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line global-require
      const { getRuleLines } = require('..') as typeof import('..')
      const slot = {
        method: '0x0000000000000000000000000000000000000000',
        config: '0x',
        label: 'ecdsa'
      } as const
      const lines = getRuleLines([{ threshold: 2, credentials: [slot, slot, slot] }])
      expect(lines.map((l) => l.key)).toContain('socialRecovery.ruleLines.oneFailureDomain')
    })
  })
})
