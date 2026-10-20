/**
 * The notices from the logs since the commit: each method of the path whose
 * trusted keys moved, with its admin where its read answered, and the notice
 * after an attempt a cancel or a setup write ended. The read that runs or
 * failed shows its own state.
 */
import React from 'react'
import { ActivityIndicator } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import { WEB_ROUTES } from '@common/modules/router/constants/common'
import spacings from '@common/styles/spacings'
import { ActionsRow, SectionCard } from '@web/modules/social-recovery/shared/chrome'
import ReadFailedBlock from '@web/modules/social-recovery/shared/chrome/ReadFailedBlock'
import {
  renderDateTimeInZone,
  renderFullAddress
} from '@web/modules/social-recovery/shared/display'

import { OVERVIEW } from './constants'
import { endedNoticeOf, movedInPath, pathMethodsOf } from './readings'
import type { NoticesBlockProps } from './types'

const NoticesBlock = ({
  reads,
  context,
  timeZone,
  ending,
  methodNameOf,
  adminOf,
  navigate
}: NoticesBlockProps) => {
  const { t } = useTranslation()
  const { notices, path } = reads

  if (notices.status === 'pending') {
    return <ActivityIndicator testID="overview-notices-reading" style={spacings.mbSm} />
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
          </SectionCard>
        )
      })}
      {!!ended && (
        <SectionCard tone="muted" testID="overview-ended">
          <Text fontSize={14} style={spacings.mbTy} testID="overview-ended-line">
            {t(
              ended.road === 'ownerCancel'
                ? `${OVERVIEW}.ended.ownerCancel`
                : `${OVERVIEW}.ended.setupWrite`,
              { date: renderDateTimeInZone(ended.at * 1000, timeZone).date }
            )}
          </Text>
          <ActionsRow
            primary={
              <Button
                testID="overview-ended-replace"
                type="secondary"
                text={t(`${OVERVIEW}.ended.replace`)}
                onPress={() => navigate(WEB_ROUTES.socialRecoveryManageEdit)}
                hasBottomSpacing={false}
              />
            }
          />
        </SectionCard>
      )}
    </>
  )
}

export default React.memo(NoticesBlock)
