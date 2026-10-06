/**
 * The deposit step, rendered from the gas check's data. The copy comes from
 * `renderDepositStep` and the rules from the gas check, so this component only
 * lays them out: the key's address in full with a copy action, the routes that
 * fill it, the notes and, for a recovery call, the lines of a step that waits
 * for the funds.
 *
 * `variant="blocker"` renders the short panel a write's own screen shows when
 * the check at sending comes up short, which leads to the step. The write's
 * own actions (continue, back, fund the key) go in as children. The step links
 * to nothing.
 */
import React, { useCallback, useState } from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { setStringAsync } from '@common/utils/clipboard'

import { renderDepositStep } from '../copy'
import type { CopyResult, DepositStepViewProps, LinesProps } from './types'

const Lines = ({ lines, secondary }: LinesProps) => (
  <>
    {lines.map((line) => (
      <Text
        key={line}
        fontSize={14}
        appearance={secondary ? 'secondaryText' : 'primaryText'}
        style={spacings.mbSm}
      >
        {line}
      </Text>
    ))}
  </>
)

const DepositStepView = ({
  step,
  balance,
  variant = 'step',
  onCopy,
  children,
  testID
}: DepositStepViewProps) => {
  const { t } = useTranslation()
  const rendered = renderDepositStep(step, balance === undefined ? {} : { balance }, t)

  // The result of the last copy to the clipboard, with the address it was
  // started for. A failed copy shows a line, so the holder selects the address
  // by hand rather than pasting an older one. The line shows only while the
  // step still shows that address: a result for another key's address, or one
  // that came back after the address changed, shows nothing. A copy through
  // `onCopy` reports no result here.
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null)

  const copy = useCallback(() => {
    const address = rendered.keyAddress
    if (onCopy) {
      onCopy(address)
    } else {
      // On web the clipboard answers false, or rejects, where it could not copy.
      setStringAsync(address)
        .then((copied) => setCopyResult({ address, copied }))
        .catch(() => setCopyResult({ address, copied: false }))
    }
  }, [onCopy, rendered.keyAddress])

  const copyFailedHere =
    !!copyResult && copyResult.address === rendered.keyAddress && !copyResult.copied

  const keyBlock = (
    <View style={spacings.mbSm}>
      {!!rendered.keyLabel && (
        <Text fontSize={12} appearance="secondaryText" style={spacings.mbMi}>
          {rendered.keyLabel}
        </Text>
      )}
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
        <Text fontSize={14} weight="number_medium" selectable style={spacings.mrTy}>
          {rendered.keyAddress}
        </Text>
        <Button
          type="secondary"
          size="small"
          text={rendered.copyLabel}
          onPress={copy}
          hasBottomSpacing={false}
        />
      </View>
      {copyFailedHere && (
        <Text fontSize={12} appearance="errorText" style={spacings.mtMi}>
          {rendered.copyFailed}
        </Text>
      )}
    </View>
  )

  if (variant === 'blocker') {
    return (
      <View testID={testID}>
        <Text fontSize={16} weight="medium" style={spacings.mbSm}>
          {rendered.blocker.title}
        </Text>
        <Lines lines={[rendered.blocker.line]} />
        {keyBlock}
        {children}
      </View>
    )
  }

  return (
    <View testID={testID}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap, spacings.mbSm]}>
        {!!rendered.eyebrow && (
          <Text fontSize={12} weight="semiBold" appearance="warningText" style={spacings.mrSm}>
            {rendered.eyebrow}
          </Text>
        )}
        <Text fontSize={16} weight="medium">
          {rendered.title}
        </Text>
      </View>
      <Lines lines={rendered.lead} />
      {keyBlock}
      {rendered.routes.map((route) => (
        <View key={route.kind} style={spacings.mbTy}>
          <Text fontSize={14} weight="medium">
            {route.line}
          </Text>
          {!!route.note && (
            <Text fontSize={12} appearance="secondaryText">
              {route.note}
            </Text>
          )}
        </View>
      ))}
      <Lines lines={rendered.notes} secondary />
      <Lines lines={rendered.waiting} secondary />
      {children}
      {!!rendered.actionHint && (
        <Text fontSize={12} appearance="secondaryText" style={spacings.mtTy}>
          {rendered.actionHint}
        </Text>
      )}
    </View>
  )
}

export default React.memo(DepositStepView)
