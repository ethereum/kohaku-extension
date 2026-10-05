import React, { useState } from 'react'
import { Pressable, View } from 'react-native'

import Button from '@common/components/Button'
import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import type { Credential } from '@web/modules/social-recovery/sdk-interfaces'
import { MethodRow, SectionLabel, StatusChip } from '@web/modules/social-recovery/shared/chrome'
import { renderMemberList } from '@web/modules/social-recovery/shared/display'

import { enrollmentOf, isRequiredRow, kindOf, pathRowOf } from './lead'
import type { PathBlockProps, RetryKind } from './types'

/**
 * The path as the editor draws it: the required rows, then each group under
 * its header with its threshold, three members and a count of the rest until
 * the holder shows them all. A passkey or guardian row whose test could not
 * run offers to run it again, on the enrollment step for that row.
 */
const PathBlock = ({ clauses, enrollments, addressBook, onRetryTest }: PathBlockProps) => {
  const { t } = useTranslation()
  const [shownAll, setShownAll] = useState<number[]>([])

  const retryKindOf = (credential: Credential): RetryKind | null => {
    if (enrollmentOf(credential, enrollments)?.test !== 'unavailable') {
      return null
    }
    const kind = kindOf(credential, addressBook)
    return kind === 'passkey' || kind === 'ecdsa' ? kind : null
  }

  const renderRow = (credential: Credential, clause: number, member: number) => {
    const testID = `review-row-${clause}-${member}`
    const row = pathRowOf(credential, enrollments, addressBook, t)
    const retryKind = retryKindOf(credential)
    return (
      <MethodRow key={testID} testID={testID}>
        <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.justifySpaceBetween]}>
          <View style={[flexbox.flex1, flexbox.directionRow, flexbox.alignCenter, flexbox.wrap]}>
            <Text fontSize={14} weight="medium" style={spacings.mrTy} testID={`${testID}-name`}>
              {row.name}
            </Text>
            {!!row.aside && (
              <Text
                fontSize={14}
                appearance="secondaryText"
                style={spacings.mrTy}
                testID={`${testID}-aside`}
              >
                {row.aside}
              </Text>
            )}
          </View>
          {!!row.chip && (
            <StatusChip text={row.chip} testID={`${testID}-chip`} style={spacings.mlTy} />
          )}
        </View>
        {row.lines.map((line, index) => (
          <Text
            // The lines of one row are fixed in number and order.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            fontSize={12}
            appearance="secondaryText"
            style={spacings.mtMi}
            testID={`${testID}-line-${index}`}
          >
            {line}
          </Text>
        ))}
        {!!retryKind && (
          <View style={[flexbox.directionRow, spacings.mtTy]}>
            <Button
              testID={`${testID}-retry-test`}
              type="secondary"
              size="small"
              text={t('socialRecovery.actions.runTheTestAgain')}
              onPress={() => onRetryTest({ kind: retryKind, clause, member })}
              hasBottomSpacing={false}
            />
          </View>
        )}
      </MethodRow>
    )
  }

  const hasRequired = clauses.some(isRequiredRow)
  let groupNumber = 0

  return (
    <View testID="review-path">
      <SectionLabel>{t('socialRecovery.review.pathHeader')}</SectionLabel>
      {hasRequired && <SectionLabel>{t('socialRecovery.editor.requiredHeader')}</SectionLabel>}
      {clauses.map((clause, index) =>
        isRequiredRow(clause) ? renderRow(clause.credentials[0], index, 0) : null
      )}
      {clauses.map((clause, index) => {
        if (isRequiredRow(clause)) {
          return null
        }
        groupNumber += 1
        const list = renderMemberList(clause.credentials, { showAll: shownAll.includes(index) }, t)
        return (
          // Clauses have no identity of their own; their order is the path's.
          // eslint-disable-next-line react/no-array-index-key
          <View key={index} testID={`review-group-${index}`} style={spacings.mtTy}>
            <View
              style={[
                flexbox.directionRow,
                flexbox.alignCenter,
                flexbox.justifySpaceBetween,
                spacings.mbTy
              ]}
            >
              <Text fontSize={16} weight="medium">
                {t('socialRecovery.shape.group', { n: groupNumber })}
              </Text>
              <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                <Text fontSize={14} style={spacings.mrTy}>
                  {t('socialRecovery.shape.require')}
                </Text>
                <Text fontSize={14} weight="medium" style={spacings.mrTy}>
                  {String(clause.threshold)}
                </Text>
                <Text fontSize={14} style={spacings.mrTy}>
                  {t('socialRecovery.shape.of')}
                </Text>
                <Text fontSize={14} weight="medium">
                  {String(clause.credentials.length)}
                </Text>
              </View>
            </View>
            {list.shown.map((credential, member) => renderRow(credential, index, member))}
            {!!list.more && (
              <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                <Text fontSize={12} appearance="secondaryText" style={spacings.mrTy}>
                  {list.more}
                </Text>
                <Pressable
                  testID={`review-group-${index}-show-all`}
                  onPress={() => setShownAll((held) => [...held, index])}
                >
                  <Text fontSize={12} weight="medium" appearance="primary" underline>
                    {t('socialRecovery.review.showAllMembers')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

export default React.memo(PathBlock)
