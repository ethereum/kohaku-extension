import React from 'react'
import { View } from 'react-native'

import { useTranslation } from '@common/config/localization'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import common from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'

import { renderKindName } from './copy'
import KindMenuEntry from './KindMenuEntry'
import { isKindOnNetwork } from './operations'
import type { KindMenuProps } from './types'

/**
 * The kinds a holder can add, one entry each, under the control that opened
 * them. A kind whose method this network's deployment omits keeps its place,
 * cannot be picked, and says so under its name.
 */
const KindMenu = ({ kinds, addressBook, onPick, disabled, testID }: KindMenuProps) => {
  const { t } = useTranslation()
  const { theme } = useTheme()

  return (
    <View
      testID={testID}
      accessibilityRole="menu"
      style={[
        common.borderRadiusPrimary,
        common.shadowSecondary,
        spacings.mtTy,
        spacings.pvMi,
        flexbox.alignSelfStart,
        {
          minWidth: 200,
          borderWidth: 1,
          borderColor: theme.secondaryBorder,
          backgroundColor: theme.primaryBackground
        }
      ]}
    >
      {kinds.map((kind) => {
        const absent = !isKindOnNetwork(kind, addressBook)
        return (
          <KindMenuEntry
            key={kind}
            label={renderKindName(kind, t)}
            note={absent ? t('socialRecovery.ceremony.notOnThisNetworkLine') : undefined}
            onPress={() => onPick(kind)}
            disabled={disabled || absent}
            testID={`${testID}-${kind}`}
          />
        )
      })}
    </View>
  )
}

export default React.memo(KindMenu)
