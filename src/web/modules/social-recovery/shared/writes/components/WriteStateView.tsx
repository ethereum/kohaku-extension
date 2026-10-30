/**
 * The shared submitting and failed states, rendered from a write's state,
 * with the write's title, its actions and a line that says the fee is checked
 * while the gas check runs, and its own line with the retry
 * where a read of the check could not run. Every social recovery write renders
 * this view and none draws its own: the copy comes from `renderWriteState` and
 * the rules from the machine, so this component only lays them out.
 *
 * A write's screen may set its own title over the state (the setup could not
 * be saved, the recovery could not be started), its own lines in place of the
 * state's, and its own sentence after the reading, from its own keys. The
 * reverted reading already speaks in the write's own words (`revertedKeyOf`),
 * so a note belongs after the not-sent reading, where the screen adds what
 * stays on this device. Its own actions, such as back or the cancel's
 * move-funds action where `offersMoveFunds` answers true, go in as children.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'

import { renderWriteState } from '../copy'
import type { WriteStateViewProps } from './types'

const WriteStateView = ({
  state,
  title,
  body,
  note,
  onRetry,
  children,
  testID
}: WriteStateViewProps) => {
  const { t } = useTranslation()

  if (state.status === 'checkingGas') {
    return (
      <View testID={testID}>
        {!!title && (
          <Text fontSize={16} weight="medium" style={spacings.mbTy}>
            {title}
          </Text>
        )}
        <View testID="write-checking-fee" style={spacings.mbTy}>
          <LoadingBlock variant="row" message={t('socialRecovery.loading.fee')} />
        </View>
        {children}
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
      {(!!rendered.chip || !!heading) && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbTy]}>
          {!!rendered.chip && (
            <Text fontSize={12} weight="semiBold" appearance="secondaryText" style={spacings.mrSm}>
              {rendered.chip}
            </Text>
          )}
          {!!heading && (
            <Text fontSize={16} weight="medium">
              {heading}
            </Text>
          )}
        </View>
      )}
      {(body ?? rendered.lines).map((line) => (
        <Text key={line} fontSize={14} style={spacings.mbTy}>
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
        <Button
          type="primary"
          size="small"
          text={rendered.retry}
          onPress={onRetry}
          hasBottomSpacing={false}
          style={[flexbox.alignSelfStart, spacings.mtTy]}
        />
      )}
      {children}
    </View>
  )
}

export default React.memo(WriteStateView)
