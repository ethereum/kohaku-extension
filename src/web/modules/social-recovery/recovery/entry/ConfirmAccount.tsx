/**
 * The confirmation of the account found: its avatar, the name it resolved
 * from with the caveat that a name can change hands, its full address and the
 * network. "This is my account" writes the recovery entry; "Not mine" goes
 * back to the field with nothing written. While the entry is read and
 * written, both hold beside a line that says the recovery opens.
 */
import React from 'react'
import { View } from 'react-native'

import Avatar from '@common/components/Avatar'
import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import {
  ActionsRow,
  PageTitle,
  SectionCard,
  SectionLabel,
  TwoColumn
} from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import {
  renderFullAddress,
  renderResolvedName,
  renderValueLabel
} from '@web/modules/social-recovery/shared/display'

import type { ConfirmAccountProps } from './types'

const CONFIRM = 'socialRecovery.entry.confirm'
const LABELS = 'socialRecovery.entry.labels'

const ConfirmAccount = ({
  target,
  networkName,
  writing,
  writeFailed,
  onConfirm,
  onNotMine,
  counter
}: ConfirmAccountProps) => {
  const { t } = useTranslation()
  const resolved = target.name ? renderResolvedName(target.name, 'besideAddressToCheck', t) : null

  const aside = (
    <>
      <SectionCard
        tone="muted"
        spacing="item"
        label={t(`${CONFIRM}.wrongAccountTitle`)}
        testID="entry-confirm-wrong-account"
      >
        <Text fontSize={12} appearance="secondaryText">
          {t(`${CONFIRM}.wrongAccountBody`)}
        </Text>
      </SectionCard>
      <SectionCard
        tone="muted"
        spacing="item"
        label={t(`${CONFIRM}.startsNothingTitle`)}
        testID="entry-confirm-starts-nothing"
      >
        <Text fontSize={12} appearance="secondaryText">
          {t(`${CONFIRM}.startsNothingBody`)}
        </Text>
      </SectionCard>
    </>
  )

  return (
    <TwoColumn testID="entry-confirm-columns" aside={aside}>
      <View testID="entry-confirm">
        {counter}
        <PageTitle
          title={t(`${CONFIRM}.title`)}
          lead={t(`${CONFIRM}.lead`)}
          titleTestID="entry-confirm-title"
        />
        <SectionCard>
          <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbSm]}>
            <Avatar pfp={target.address} isSmart={false} size={32} displayTypeBadge={false} />
            <View style={flexbox.flex1}>
              {!!resolved && (
                <Text fontSize={16} weight="medium" testID="entry-confirm-name">
                  {resolved.name}
                </Text>
              )}
              <Text fontSize={12} appearance="secondaryText">
                {renderValueLabel('accountBeingRecovered', t)}
              </Text>
            </View>
          </View>
          <SectionLabel>{t(`${LABELS}.address`)}</SectionLabel>
          <Text
            fontSize={14}
            weight="number_medium"
            selectable
            style={spacings.mbSm}
            testID="entry-confirm-address"
          >
            {renderFullAddress(target.address)}
          </Text>
          <SectionLabel>{t(`${LABELS}.network`)}</SectionLabel>
          <Text fontSize={14} style={spacings.mbSm} testID="entry-confirm-network">
            {networkName}
          </Text>
          {!!resolved?.caveat && (
            <Text fontSize={12} appearance="warningText" testID="entry-confirm-name-caveat">
              {resolved.caveat}
            </Text>
          )}
        </SectionCard>

        {writeFailed && (
          <Text
            fontSize={14}
            appearance="errorText"
            style={spacings.mbSm}
            testID="entry-confirm-write-failed"
          >
            {t('socialRecovery.records.writeFailed')}
          </Text>
        )}

        <ActionsRow
          primary={
            <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
              <Button
                testID="entry-confirm-mine"
                type="primary"
                text={t(`${CONFIRM}.thisIsMine`)}
                disabled={writing}
                onPress={onConfirm}
                hasBottomSpacing={false}
              />
              {writing && (
                <View testID="entry-confirm-writing" style={spacings.mlSm}>
                  <LoadingBlock variant="row" message={t('socialRecovery.loading.session')} />
                </View>
              )}
            </View>
          }
          secondary={
            <Button
              testID="entry-confirm-not-mine"
              type="outline"
              text={t(`${CONFIRM}.notMine`)}
              disabled={writing}
              onPress={onNotMine}
              hasBottomSpacing={false}
            />
          }
        />
      </View>
    </TwoColumn>
  )
}

export default React.memo(ConfirmAccount)
