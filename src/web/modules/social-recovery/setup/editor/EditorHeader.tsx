import React from 'react'

import Alert from '@common/components/Alert'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'
import { PageTitle } from '@web/modules/social-recovery/shared/chrome'

import type { EditorHeaderProps } from './types'

/**
 * The heading for building or adjusting a path, and the line a refused
 * duplicate leaves.
 */
const EditorHeader = ({ mode, refused }: EditorHeaderProps) => {
  const { t } = useTranslation()
  const heading = mode === 'adjust' ? 'adjust' : 'build'

  return (
    <>
      <PageTitle
        title={t(`socialRecovery.editor.${heading}.title`)}
        lead={t(`socialRecovery.editor.${heading}.lead`)}
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
