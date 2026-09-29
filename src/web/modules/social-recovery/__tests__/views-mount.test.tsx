/**
 * @jest-environment jsdom
 *
 * A view built from the extension's own components mounts under Jest: the real
 * Text and Button render the socialRecovery strings from en.json into the DOM,
 * and a press reaches the handler.
 *
 * act comes from react-dom/test-utils because React 18.3.0 exports none of its own.
 */
import { createRoot, Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import i18n from '@common/config/localization'
import en from '@common/config/localization/translations/en.json'
import type { Translate } from '@web/modules/social-recovery/shared/display/types'

const t: Translate = i18n.t

// React only runs effects and state updates inside act() when this flag is set.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const HonestyView = ({ onCustomize }: { onCustomize: () => void }) => (
  <>
    <Text testID="honesty-note">{t('socialRecovery.honestyNote')}</Text>
    <Button testID="customize" text={t('socialRecovery.presets.customize')} onPress={onCustomize} />
  </>
)

describe('a mounted view', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  const mount = (onCustomize: () => void = () => {}) =>
    act(() => {
      root.render(<HonestyView onCustomize={onCustomize} />)
    })

  const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`)

  it('shows the honesty note exactly as en.json words it', () => {
    mount()
    expect(byTestId('honesty-note')?.textContent).toBe(en.socialRecovery.honestyNote)
  })

  it('shows the button label from en.json and calls the handler on a press', () => {
    const onCustomize = jest.fn()
    mount(onCustomize)
    const button = byTestId('customize') as HTMLElement
    expect(button.textContent).toBe(en.socialRecovery.presets.customize)
    act(() => {
      button.click()
    })
    expect(onCustomize).toHaveBeenCalledTimes(1)
  })
})
