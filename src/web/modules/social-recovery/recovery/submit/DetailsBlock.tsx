/**
 * Verify the details, the confirmation's expander under Start recovery, each part a
 * muted card: the recovery path with the rows the submission carries and the
 * rows not needed, the waiting period as a duration, that only the account's
 * own key can cancel, what the submission publishes, and on the logged-in
 * route that the installed key then controls two accounts.
 */
import React, { useState } from 'react'
import { Pressable, View } from 'react-native'

import DownArrowIcon from '@common/assets/svg/DownArrowIcon'
import UpArrowIcon from '@common/assets/svg/UpArrowIcon'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import { SectionCard } from '@web/modules/social-recovery/shared/chrome'
import { renderNoun } from '@web/modules/social-recovery/shared/display'
import ChecklistRows from '@web/modules/social-recovery/recovery/checklist/ChecklistRows'
import RowFrame from '@web/modules/social-recovery/recovery/checklist/RowFrame'
import type { ChecklistRow } from '@web/modules/social-recovery/recovery/checklist'
import { renderWait } from '@web/modules/social-recovery/setup/review'

import { pathLinesOf, pathRowsOf, publicationLinesOf } from './lead'
import type { DetailsBlockProps } from './types'

const SUBMIT = 'socialRecovery.submit'

const DetailsBlock = ({ route, ready }: DetailsBlockProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const { layout, chosen, assessment, configuration } = ready
  const rows = pathRowsOf(layout, chosen, t)

  const line = (text: string, testID?: string) => (
    <Text key={text} fontSize={12} appearance="secondaryText" style={spacings.mbTy} testID={testID}>
      {text}
    </Text>
  )

  const renderRow = (row: ChecklistRow) => {
    const view = rows.find((candidate) => candidate.row.place === row.place)
    if (!view) {
      return null
    }
    return (
      <RowFrame
        row={row}
        state={{ chip: view.carried ? 'complete' : 'notNeeded', replied: view.carried }}
        title={view.title}
        label={view.label}
      />
    )
  }

  return (
    <View testID="submit-details">
      <Pressable
        testID="submit-verify-details"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((open) => !open)}
        style={[
          flexbox.directionRow,
          flexbox.alignCenter,
          flexbox.justifySpaceBetween,
          common.borderRadiusPrimary,
          spacings.ph,
          spacings.pvSm,
          expanded ? spacings.mbTy : spacings.mbLg,
          {
            borderWidth: 1,
            borderColor: theme.secondaryBorder,
            backgroundColor: theme.secondaryBackground
          }
        ]}
      >
        <Text fontSize={14} weight="medium">
          {t('socialRecovery.review.verifyDetails')}
        </Text>
        {expanded ? <UpArrowIcon /> : <DownArrowIcon />}
      </Pressable>
      {expanded && (
        <>
          <SectionCard
            tone="muted"
            spacing="item"
            label={renderNoun('recoveryPath', t)}
            testID="submit-path"
          >
            <ChecklistRows layout={layout} assessment={assessment} renderRow={renderRow} />
            <View style={spacings.mtSm}>
              {pathLinesOf(layout, chosen, t).map((text) => line(text, 'submit-path-line'))}
            </View>
          </SectionCard>
          <SectionCard
            tone="muted"
            spacing="item"
            label={renderNoun('waitingPeriod', t)}
            testID="submit-wait"
          >
            {line(
              t(`${SUBMIT}.waitingPeriod`, { duration: renderWait(configuration.wait, t) }),
              'submit-waiting-period'
            )}
            {line(t(`${SUBMIT}.ownerCanCancel`), 'submit-owner-can-cancel')}
          </SectionCard>
          <SectionCard
            tone="muted"
            spacing="item"
            label={t('socialRecovery.review.publicationHeader')}
            testID="submit-publication"
          >
            {publicationLinesOf(layout, chosen, t).map((text) =>
              line(text, 'submit-publication-line')
            )}
            {route === 'logged-in' &&
              line(t('socialRecovery.entry.owner.twoAccounts'), 'submit-two-accounts')}
          </SectionCard>
        </>
      )}
    </View>
  )
}

export default React.memo(DetailsBlock)
