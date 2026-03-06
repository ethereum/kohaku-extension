import React from 'react'
import { Pressable, View } from 'react-native'

import RefreshIcon from '@common/modules/dashboard/components/DashboardOverview/RefreshIcon'
import Spinner from '@common/components/Spinner'
import Text from '@common/components/Text/Text'
import useTheme from '@common/hooks/useTheme'
import spacings, { SPACING_TY } from '@common/styles/spacings'
import { BORDER_RADIUS_PRIMARY } from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import NetworkVerificationBadge from '@web/components/NetworkVerificationBadge'

const RED_ACCENT = '#D01C15'
const RED_BG = '#D01C1520'

interface Props {
  displayedInteger: string
  displayedDecimal: string | undefined
  isPrivateLoading: boolean
  isLoadingPublicBalances: boolean
  loadingError: string | null | undefined
  onRefresh: () => void
  onRetry: () => void
}

const HoldingsSection = ({
  displayedInteger,
  displayedDecimal,
  isPrivateLoading,
  isLoadingPublicBalances,
  loadingError,
  onRefresh,
  onRetry
}: Props) => {
  const { styles, theme } = useTheme()

  return (
    <View style={[flexbox.alignCenter, spacings.pvLg]}>
      <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mbSm]}>
        <Text
          type="caption"
          weight="medium"
          appearance="secondaryText"
          style={{ letterSpacing: 2 }}
        >
          TOTAL HOLDINGS
        </Text>
        <Pressable onPress={onRefresh} style={[spacings.mlTy]}>
          <RefreshIcon width={12} height={12} color={String(theme.secondaryText)} />
        </Pressable>
      </View>
      <View style={[flexbox.directionRow, { alignItems: 'baseline' }]}>
        <Text fontSize={32} weight="number_bold" shouldScale={false} appearance="primaryText">
          {displayedInteger}
        </Text>
        {displayedDecimal && (
          <Text style={styles.cents} weight="number_bold" shouldScale={false}>
            .{displayedDecimal}
          </Text>
        )}
      </View>
      {isPrivateLoading && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mtTy]}>
          <Spinner variant="white" style={{ width: 18, height: 18 }} />
          <View style={[{ width: SPACING_TY }]} />
          <Text type="caption" weight="regular" appearance="secondaryText">
            Loading Private Account
          </Text>
        </View>
      )}
      {isLoadingPublicBalances && (
        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mtTy]}>
          <Spinner variant="white" style={{ width: 18, height: 18 }} />
          <View style={[{ width: SPACING_TY }]} />
          <Text type="caption" weight="regular" appearance="secondaryText">
            Loading Public Accounts
          </Text>
        </View>
      )}
      {!!loadingError && (
        <Pressable
          onPress={onRetry}
          style={[
            flexbox.directionRow,
            flexbox.alignCenter,
            flexbox.justifyCenter,
            spacings.mtSm,
            {
              height: 32,
              paddingHorizontal: 12,
              borderRadius: BORDER_RADIUS_PRIMARY,
              backgroundColor: RED_BG,
              borderWidth: 1,
              borderColor: RED_ACCENT
            }
          ]}
        >
          <Text color={RED_ACCENT} weight="regular" fontSize={12}>
            Retry Loading Private Account
          </Text>
          <View style={[{ width: 6 }]} />
          <RefreshIcon color={RED_ACCENT} width={14} height={14} />
        </Pressable>
      )}
      <View style={[flexbox.directionRow, flexbox.center, spacings.mtMi]}>
        <NetworkVerificationBadge testID="rpc-verification-badge" />
      </View>
    </View>
  )
}

export default HoldingsSection
