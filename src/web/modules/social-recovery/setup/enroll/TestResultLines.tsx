/**
 * What a row's access test reads: the stored verdict's lasting line, then the
 * notes and the browser's error name of the outcome that just arrived, which
 * a reload drops.
 */
import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { browserErrorNameOf } from '@web/modules/social-recovery/shared/ceremony'
import { MethodRow } from '@web/modules/social-recovery/shared/chrome'

import { testNoteKeysOf } from './outcome'
import type { TestResultLinesProps } from './types'

const TestResultLines = ({ row, lineKey, outcome, children }: TestResultLinesProps) => {
  const { t } = useTranslation()
  const notes = outcome ? testNoteKeysOf(outcome, lineKey) : []
  const error = outcome ? browserErrorNameOf(outcome) : null

  return (
    <>
      {!!lineKey && (
        <Text testID={`${row}-test-line`} fontSize={14}>
          {t(lineKey)}
        </Text>
      )}
      {children}
      {notes.map((note) => (
        <Text key={note} testID={`${row}-test-note`} fontSize={12} appearance="secondaryText">
          {t(note)}
        </Text>
      ))}
      {!!error && (
        <MethodRow quiet style={spacings.mtTy}>
          <Text testID={`${row}-test-error`} fontSize={12} appearance="secondaryText">
            {error}
          </Text>
        </MethodRow>
      )}
    </>
  )
}

export default React.memo(TestResultLines)
