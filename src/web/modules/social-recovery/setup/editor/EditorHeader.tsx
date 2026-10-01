import React from 'react'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

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
      <Text fontSize={20} weight="semiBold" style={spacings.mbTy} testID="editor-title">
        {t(`socialRecovery.editor.${heading}.title`)}
      </Text>
      <Text fontSize={14} appearance="secondaryText" style={spacings.mbLg}>
        {t(`socialRecovery.editor.${heading}.lead`)}
      </Text>

      {refused && (
        <Text fontSize={14} appearance="errorText" style={spacings.mbMd} testID="editor-refusal">
          {t('socialRecovery.editor.duplicate')}
        </Text>
      )}
    </>
  )
}

export default React.memo(EditorHeader)
