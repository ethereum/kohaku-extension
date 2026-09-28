/**
 * A caller that passes no `t` gets en.json's own words: the cause sentence,
 * the write state and the deposit step read the app's i18next by default,
 * with the placeholders filled.
 */
import en from '@common/config/localization/translations/en.json'

import {
  failWithReceipt,
  gasReadErrorFor,
  GWEI,
  kitError,
  mockReads,
  NETWORK,
  renderDepositStep,
  renderRevertCause,
  renderWriteState,
  runGasCheck,
  stepOf
} from './harness'

const WRITES = en.socialRecovery.writes

describe('the renderers read en.json when the caller passes no t', () => {
  it('renderRevertCause: a named cause and a cause the wallet cannot name', () => {
    expect(
      renderRevertCause({ kind: 'named', name: 'WaitNotOver', error: kitError('WaitNotOver') })
    ).toBe(WRITES.causes.WaitNotOver)
    expect(renderRevertCause({ kind: 'unnamed' })).toBe(WRITES.causes.unnamed)
  })

  it('renderWriteState: a failed gas read reads its line and the retry', () => {
    expect(renderWriteState(gasReadErrorFor('save'))).toMatchObject({
      lines: [WRITES.gasCheckFailed],
      retry: WRITES.tryAgain
    })
  })

  it('renderWriteState: a revert reads its sentence with the cause in its slot', () => {
    expect(renderWriteState(failWithReceipt('ownerWrite', kitError('WaitNotOver'))).lines).toEqual([
      WRITES.reverted.replace('{{cause}}', WRITES.causes.WaitNotOver)
    ])
  })

  it('renderDepositStep: the fast track reads its title, its lead, the copy label and the amount line', async () => {
    const step = stepOf(
      await runGasCheck({
        write: 'submission',
        fastTrack: true,
        reads: mockReads({ balance: 0n, gas: 250_000n, price: 5n * GWEI })
      })
    )
    const rendered = renderDepositStep(step)
    expect(rendered.title).toBe(WRITES.gas.fundTitle)
    expect(rendered.lead).toEqual([WRITES.gas.sendingKeyPays])
    expect(rendered.copyLabel).toBe(WRITES.gas.copy)
    expect(rendered.routes.map((route) => route.line)).toEqual([
      WRITES.gas.submissionAmount.replace('{{amount}}', '0.0015 ETH')
    ])
    expect(rendered.notes).toContain(WRITES.gas.network.replace('{{network}}', NETWORK.name))
  })
})
