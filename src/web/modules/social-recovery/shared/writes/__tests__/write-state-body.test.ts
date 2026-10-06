/**
 * @jest-environment jsdom
 *
 * A write's screen may give the shared state view its own lines, already
 * translated, in place of the state's own. The title, the note after the
 * lines, the screen's own controls and the retry rule stay as they are.
 *
 * The view is compiled from its source with its JSX as `React.createElement`
 * and loaded with the app's button, text, spinner and styles replaced by plain
 * stand-ins, as the deposit step's mounted test does. jsdom has no
 * `TextEncoder`, which the module's chain reads load, so the test sets Node's
 * before it loads the module.
 */
import fs from 'fs'
import path from 'path'
import * as React from 'react'
import { createRoot, Root } from 'react-dom/client'
import ts from 'typescript'
import { TextDecoder, TextEncoder } from 'util'
import vm from 'vm'

import type { WriteState } from '@web/modules/social-recovery/shared/writes'
import type { WriteStateViewProps } from '@web/modules/social-recovery/shared/writes/components'

Object.assign(globalThis, { TextEncoder, TextDecoder })

const client = jest.requireActual<typeof import('@web/modules/social-recovery/shared/client')>(
  '@web/modules/social-recovery/shared/client'
)
const harness = jest.requireActual<
  typeof import('@web/modules/social-recovery/shared/writes/__tests__/harness')
>('@web/modules/social-recovery/shared/writes/__tests__/harness')
const { ACCOUNT, submittingFor, userRejected, writeReducer, WRITES_KEYS } = harness
const { t } = jest.requireActual<typeof import('@common/config/localization')>(
  '@common/config/localization'
).default

const VIEWS = path.resolve(__dirname, '..', 'components')

// React 18.3.0 exports `act` only as `unstable_act`.
const act: typeof React.act =
  (React as unknown as { act?: typeof React.act }).act ??
  (React as unknown as { unstable_act: typeof React.act }).unstable_act
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const StandInButton = ({ text: label, onPress }: { text: string; onPress: () => void }) =>
  React.createElement('button', { type: 'button', onClick: onPress }, label)
const StandInText = ({ children }: { children?: React.ReactNode }) =>
  React.createElement('p', null, children)
const StandInSpinner = () => React.createElement('progress')
/** Every style the view asks for is empty: the app's style modules load the native app config. */
const noStyles = new Proxy({}, { get: () => ({}) })
const STAND_INS: Record<string, unknown> = {
  '@common/components/Button': { __esModule: true, default: StandInButton },
  '@common/components/Text': { __esModule: true, default: StandInText },
  '@common/components/Spinner': { __esModule: true, default: StandInSpinner },
  '@common/styles/spacings': { __esModule: true, default: noStyles }
}

const loadView = (): React.ComponentType<WriteStateViewProps> => {
  const file = path.join(VIEWS, 'WriteStateView.tsx')
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true
    }
  })
  const load = (specifier: string): unknown =>
    STAND_INS[specifier] ??
    jest.requireActual(specifier.startsWith('.') ? path.resolve(VIEWS, specifier) : specifier)
  const loaded: { exports: { default?: React.ComponentType<WriteStateViewProps> } } = {
    exports: {}
  }
  vm.compileFunction(outputText, ['require', 'module', 'exports'], { filename: file })(
    load,
    loaded,
    loaded.exports
  )
  if (!loaded.exports.default) {
    throw new Error('WriteStateView exports no component')
  }
  return loaded.exports.default
}
const WriteStateView = loadView()

let root: Root | undefined
let container: HTMLElement

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  container.remove()
})

const show = async (props: WriteStateViewProps) => {
  root = createRoot(container)
  await act(async () => {
    root?.render(React.createElement(WriteStateView, props))
  })
}

const shownTexts = () => Array.from(container.querySelectorAll('p')).map((p) => p.textContent)
const buttons = () => Array.from(container.querySelectorAll('button')).map((b) => b.textContent)

const failedWith = (error: unknown): WriteState => {
  const submitting = submittingFor('save')
  return writeReducer(submitting, { type: 'error', run: submitting.run, error }) as WriteState
}

const NOT_SENT = () => failedWith(userRejected())
const MAY_STILL_LAND = () => failedWith(client.accountBatchRefusal('not-a-transaction', ACCOUNT))
const OTHER_REQUEST = () => failedWith(client.accountBatchRefusal('other-request-pending', ACCOUNT))

const BODY = ['The first line of the screen.', 'The second line of the screen.']
const TITLE = 'The title of the screen.'
const NOTE = 'What stays on this device.'
const CHECK_AGAIN = 'Check again'
const checkAgain = () => React.createElement('button', { type: 'button' }, CHECK_AGAIN)

describe('the lines a screen gives the state view', () => {
  it("replace the not-sent state's line, and keep the title, the note, the retry and the screen's controls", async () => {
    const onRetry = jest.fn()
    await show({
      state: NOT_SENT(),
      title: TITLE,
      body: BODY,
      note: NOTE,
      onRetry,
      children: checkAgain()
    })
    expect(shownTexts()).toEqual([TITLE, ...BODY, NOTE])
    expect(shownTexts()).not.toContain(t(WRITES_KEYS.notSent))
    expect(buttons()).toEqual([t(WRITES_KEYS.tryAgain), CHECK_AGAIN])
    act(() => {
      container.querySelector('button')?.click()
    })
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("leave the state's own line where the screen gives none", async () => {
    await show({ state: NOT_SENT(), title: TITLE, note: NOTE, onRetry: jest.fn() })
    expect(shownTexts()).toEqual([TITLE, t(WRITES_KEYS.notSent), NOTE])
    expect(buttons()).toEqual([t(WRITES_KEYS.tryAgain)])
  })

  it('replace the may-still-land line, and still offer no retry, the screen offering its own check', async () => {
    const onRetry = jest.fn()
    await show({ state: MAY_STILL_LAND(), body: BODY, onRetry, children: checkAgain() })
    expect(shownTexts()).toEqual(BODY)
    expect(buttons()).toEqual([CHECK_AGAIN])
  })

  it('leave the may-still-land state its one line with no title and no retry where the screen gives none', async () => {
    await show({ state: MAY_STILL_LAND(), onRetry: jest.fn(), children: checkAgain() })
    expect(shownTexts()).toEqual([t(WRITES_KEYS.mayStillLand)])
    expect(buttons()).toEqual([CHECK_AGAIN])
  })

  it('replace the other-request line, and keep its retry', async () => {
    await show({ state: OTHER_REQUEST(), body: BODY, onRetry: jest.fn() })
    expect(shownTexts()).toEqual(BODY)
    expect(buttons()).toEqual([t(WRITES_KEYS.tryAgain)])
  })

  it('leave the other-request state its own line and its retry where the screen gives none', async () => {
    await show({ state: OTHER_REQUEST(), onRetry: jest.fn() })
    expect(shownTexts()).toEqual([t(WRITES_KEYS.otherRequestPending)])
    expect(buttons()).toEqual([t(WRITES_KEYS.tryAgain)])
  })

  it("replace the submitting state's line, and keep its chip, its title and the note, with no retry", async () => {
    const state = submittingFor('save') as WriteState
    await show({ state, body: BODY, note: NOTE, onRetry: jest.fn() })
    const texts = shownTexts()
    expect(texts.slice(-3)).toEqual([...BODY, NOTE])
    expect(texts).not.toContain(t(WRITES_KEYS.submittingBody))
    expect(texts).toContain(t(WRITES_KEYS.submitting))
    expect(buttons()).toEqual([])
  })
})
