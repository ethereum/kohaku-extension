import React from 'react'

import Alert from '@common/components/Alert'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { PageTitle } from '@web/modules/social-recovery/shared/chrome'

import type { EditorHeaderProps } from './types'

/**
 * The heading over the draft, whose lead follows how far its slots are filled
 * unless the host gives its own, and the line a refused duplicate leaves.
 */
const EditorHeader = ({ fill, refused, heading }: EditorHeaderProps) => {
  const { t } = useTranslation()

  return (
    <>
      <PageTitle
        title={heading?.title ?? t('socialRecovery.editor.title')}
        lead={heading?.lead ?? t(`socialRecovery.editor.lead.${fill}`)}
        titleTestID="editor-title"
      />

      {refused && (
        <Alert
          type="error"
          size="sm"
          style={spacings.mbLg}
          text={
            <Alert.Text size="sm" type="error" testID="editor-refusal">
              {t('socialRecovery.editor.duplicate')}
            </Alert.Text>
          }
        />
      )}
    </>
  )
}

export default React.memo(EditorHeader)
