/**
 * The submitting state and the failed state exist once, and every write
 * renders them. The failed state's two readings are distinct states, never one
 * state with a flag.
 */
import fs from 'fs'
import path from 'path'

import {
  CONTROLLER,
  copyOfState,
  failBeforeHash,
  FAILED_STATUSES,
  failThrown,
  failWithReceipt,
  kitError,
  minedAndReverted,
  submittingFor,
  UNRESOLVED,
  userRejected,
  WRITE_KINDS
} from './harness'

const MODULE_DIR = path.resolve(__dirname, '..')

const sourcesOf = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourcesOf(full)
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })

describe('the shared write states exist once', () => {
  it('the two readings are distinct states, never one state with a flag', () => {
    const notSent = failBeforeHash('save', userRejected())
    const reverted = failWithReceipt('save', kitError('WrongSetupNonce'))
    expect(notSent.status).not.toEqual(reverted.status)
    expect([notSent.status, reverted.status].sort()).toEqual([...FAILED_STATUSES].sort())
  })

  it('every failure of every write lands in one of those two readings, the reverted cancel included', () => {
    const statuses = new Set(
      WRITE_KINDS.flatMap((write) => [
        failBeforeHash(write, userRejected()).status,
        failWithReceipt(write, kitError('NoActiveAttempt'), {
          ended: 'executed',
          controller: CONTROLLER
        }).status,
        failThrown(write, minedAndReverted()).status
      ])
    )
    expect([...statuses].sort()).toEqual([...FAILED_STATUSES].sort())
  })

  WRITE_KINDS.forEach((write) =>
    it(`${write} enters the one submitting state and renders it through en.json`, () => {
      const state = submittingFor(write)
      expect(state.status).toBe('submitting')
      const rendered = copyOfState(state)
      expect(rendered.length).toBeGreaterThan(1)
      expect(rendered.filter((s) => UNRESOLVED.test(s))).toEqual([])
    })
  )

  it('no source of the module names a second submitting or failed state', () => {
    const literals = new Set(
      sourcesOf(MODULE_DIR).flatMap((file) => {
        const code = fs
          .readFileSync(file, 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/^\s*\/\/.*$/gm, '')
        return (code.match(/['"`]\w*(?:submit|fail)\w*['"`]/gi) ?? []).map((literal) =>
          literal.slice(1, -1)
        )
      })
    )
    expect([...literals].sort()).toEqual(['submitting', ...FAILED_STATUSES].sort())
  })
})
