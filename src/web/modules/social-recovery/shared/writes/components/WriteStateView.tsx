/**
 * The shared submitting and failed states, rendered from a write's state,
 * with a spinner while the gas check runs and its own line with the retry
 * where a read of the check could not run. Every social recovery write renders
 * this view and none draws its own: the copy comes from `renderWriteState` and
 * the rules from the machine, so this component only lays them out.
 *
 * A write's screen may set its own title over the state (the setup could not
 * be saved, the recovery could not be started) and its own sentence after the
 * reading, from its own keys. The reverted reading already speaks in the
 * write's own words (`revertedKeyOf`), so a note belongs after the not-sent
 * reading, where the screen adds what stays on this device. Its own actions,
 * such as back or the cancel's move-funds action where `offersMoveFunds`
 * answers true, go in as children.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import { renderWriteState } from '../copy'
import type { WriteStateViewProps } from './types'

const WriteStateView = ({ state, title, note, onRetry, children, testID }: WriteStateViewProps) => {
  const { t } = useTranslation()

  if (state.status === 'checkingGas') {
    return (
      <View testID={testID}>
        <Spinner />
      </View>
    )
  }
  if (
    state.status !== 'gasReadError' &&
    state.status !== 'submitting' &&
    state.status !== 'failedNotSent' &&
    state.status !== 'failedReverted'
  ) {
    return null
  }

  const rendered = renderWriteState(state, t)
  const heading = title ?? rendered.title

  return (
    <View testID={testID}>
      {!!rendered.chip && (
        <Text fontSize={12} weight="medium" appearance="secondaryText" style={spacings.mbTy}>
          {rendered.chip}
        </Text>
      )}
      {!!heading && (
        <Text fontSize={16} weight="semiBold" style={spacings.mbSm}>
          {heading}
        </Text>
      )}
      {rendered.lines.map((line) => (
        <Text key={line} fontSize={14} style={spacings.mbSm}>
          {line}
        </Text>
      ))}
      {!!rendered.controller && (
        <View style={spacings.mbSm}>
          <Text fontSize={12} appearance="secondaryText" style={spacings.mbMi}>
            {rendered.controller.label}
          </Text>
          <Text fontSize={14} weight="number_medium" selectable>
            {rendered.controller.address}
          </Text>
        </View>
      )}
      {!!note && (
        <Text fontSize={14} appearance="secondaryText" style={spacings.mbSm}>
          {note}
        </Text>
      )}
      {!!rendered.retry && !!onRetry && (
        <Button type="primary" text={rendered.retry} onPress={onRetry} hasBottomSpacing={false} />
      )}
      {children}
    </View>
  )
}

export default React.memo(WriteStateView)
