/**
 * The notices from the logs since the commit: each method of the path whose
 * trusted keys moved, with its admin where its read answered, and the notice
 * after an attempt a cancel or a setup write ended. While the logs are read,
 * the notice the watcher's last ending reads as stays on screen beside a line
 * that names the read, its action held; with no such notice, a waiting block
 * names the read; a failed read shows its own state. Where
 * nothing here may act on the account, the notices keep their text and draw
 * no action.
 */
import React from 'react'
import { View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'
import LoadingBlock from '@web/modules/social-recovery/shared/chrome/LoadingBlock'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'
import RefreshingLine from '@web/modules/social-recovery/shared/chrome/RefreshingLine'
import {
  renderDateTimeInZone,
  renderFullAddress
} from '@web/modules/social-recovery/shared/display'

import { OVERVIEW } from './constants'
import { endedNoticeOf, movedInPath, pathMethodsOf, watchedEndedNoticeOf } from './readings'
import type { EndedNotice, NoticesBlockProps } from './types'

const NoticesBlock = ({
  reads,
  context,
  timeZone,
  ending,
  methodNameOf,
  adminOf,
  navigate,
  actionable
}: NoticesBlockProps) => {
  const { t } = useTranslation()
  const { notices, path } = reads

  // The ended notice, its replace action held until the logs since the commit answer.
  const endedBlock = (ended: EndedNotice, canReplace: boolean) => (
    <SectionCard tone="muted" testID="overview-ended">
      <Text fontSize={14} style={spacings.mbTy} testID="overview-ended-line">
        {t(
          ended.road === 'ownerCancel'
            ? `${OVERVIEW}.ended.ownerCancel`
            : `${OVERVIEW}.ended.setupWrite`,
          { date: renderDateTimeInZone(ended.at * 1000, timeZone).date }
        )}
      </Text>
      {actionable && (
        <ActionsRow
          primary={
            <Button
              testID="overview-ended-replace"
              type="secondary"
              text={t(`${OVERVIEW}.ended.replace`)}
              disabled={!canReplace}
              onPress={() => navigate(WEB_ROUTES.socialRecoveryManageEdit)}
              hasBottomSpacing={false}
            />
          }
        />
      )}
    </SectionCard>
  )

  if (notices.status === 'pending') {
    const watched = watchedEndedNoticeOf(ending)
    if (!watched) {
      return (
        <View testID="overview-notices-reading">
          <LoadingBlock variant="block" message={t('socialRecovery.loading.notices')} />
        </View>
      )
    }
    return (
      <>
        <View testID="overview-notices-reading" style={spacings.mbSm}>
          <RefreshingLine messageKey="socialRecovery.loading.notices" />
        </View>
        {endedBlock(watched, false)}
      </>
    )
  }
  if (notices.status === 'failed') {
    return (
      <ReadFailedBlock
        testID="overview-notices-failed"
        title={t(`${OVERVIEW}.reads.noticesFailedTitle`)}
        body={t(`${OVERVIEW}.reads.noticesFailedBody`)}
        onRetry={reads.retryNotices}
      />
    )
  }
  const moved = movedInPath(notices.value.moved, pathMethodsOf(path, context.addressBook))
  const ended = endedNoticeOf(ending, notices.value.cancelledAttempts)
  return (
    <>
      {moved.map(({ method }) => {
        const id = method.toLowerCase()
        const admin = adminOf(method)
        return (
          <SectionCard key={id} testID={`overview-moved-${id}`}>
            <Text
              fontSize={16}
              weight="medium"
              style={spacings.mbTy}
              testID={`overview-moved-${id}-title`}
            >
              {t(`${OVERVIEW}.movedKeys.title`, { method: methodNameOf(method) })}
            </Text>
            <Text fontSize={14} style={spacings.mbTy}>
              {t(`${OVERVIEW}.movedKeys.body`)}
            </Text>
            <Text fontSize={14} appearance="secondaryText" style={spacings.mbTy}>
              {t(`${OVERVIEW}.movedKeys.admin`)}
            </Text>
            {!!admin && (
              <Text
                fontSize={14}
                weight="number_medium"
                selectable
                style={spacings.mbTy}
                testID={`overview-moved-${id}-admin`}
              >
                {renderFullAddress(admin)}
              </Text>
            )}
            <Text
              fontSize={14}
              weight="medium"
              style={spacings.mbTy}
              testID={`overview-moved-${id}-caveat`}
            >
              {t(`${OVERVIEW}.movedKeys.caveat`)}
            </Text>
            {actionable && (
              <ActionsRow
                primary={
                  <Button
                    testID={`overview-moved-${id}-edit`}
                    type="secondary"
                    text={t(`${OVERVIEW}.movedKeys.edit`)}
                    onPress={() => navigate(WEB_ROUTES.socialRecoveryManageEdit)}
                    hasBottomSpacing={false}
                  />
                }
              />
            )}
          </SectionCard>
        )
      })}
      {!!ended && endedBlock(ended, true)}
    </>
  )
}

export default React.memo(NoticesBlock)
