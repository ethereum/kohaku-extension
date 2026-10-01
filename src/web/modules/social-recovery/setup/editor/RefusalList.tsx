import React from 'react'
import { View } from 'react-native'

import Text from '@common/components/Text'
import { useTranslation } from '@common/config/localization'
import spacings from '@common/styles/spacings'

import { renderRefusal, renderRefusalPlace } from './copy'
import type { RefusalListProps } from './types'

/** The wallet's own refusals of the path, each headed by the clause it is about. */
const RefusalList = ({ refusals, roles }: RefusalListProps) => {
  const { t } = useTranslation()

  if (refusals.length === 0) {
    return null
  }

  return (
    <View style={spacings.mbMd} testID="editor-wallet-refusals">
      {refusals.map((refusal, index) => {
        const place = renderRefusalPlace(refusal, roles, t)
        return (
          <View
            // Two clauses can be refused with one sentence.
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            style={spacings.mbTy}
            testID="editor-wallet-refusal-item"
          >
            {!!place && (
              <Text
                fontSize={12}
                weight="semiBold"
                appearance="errorText"
                testID="editor-wallet-refusal-place"
              >
                {place}
              </Text>
            )}
            <Text fontSize={14} appearance="errorText" testID="editor-wallet-refusal">
              {renderRefusal(refusal, t)}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

export default React.memo(RefusalList)
