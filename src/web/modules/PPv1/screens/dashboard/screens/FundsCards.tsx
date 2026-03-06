import React, { useEffect, useRef } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, View, ViewStyle } from 'react-native'

import formatDecimals from '@ambire-common/utils/formatDecimals/formatDecimals'
import LockIcon from '@common/assets/svg/LockIcon/LockIcon'
import Text from '@common/components/Text/Text'
import useTheme from '@common/hooks/useTheme'
import spacings, { SPACING, SPACING_SM, SPACING_TY } from '@common/styles/spacings'
import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_PRIMARY, BORDER_RADIUS_SECONDARY } from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'

type ActiveView = 'public' | 'private'

interface Style {
  fundsCard: ViewStyle
  fundsLabel: ViewStyle
  privateFundsAmountRow: ViewStyle
  publicFundsAmountRow: ViewStyle
  revealSection: ViewStyle
  revealLabel: ViewStyle
  revealLabel2: ViewStyle
  publicAccountsScroll: ViewStyle
  accountRow: ViewStyle
  accountRowPressed: ViewStyle
  publicFundsCard: ViewStyle
}

const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    fundsCard: {
      flex: 1,
      backgroundColor: theme.secondaryBackground,
      borderRadius: BORDER_RADIUS_SECONDARY,
      padding: SPACING,
      borderWidth: 1,
      borderColor: 'transparent',
      overflow: 'hidden'
    },
    fundsLabel: {
      ...flexbox.directionRow,
      ...flexbox.alignCenter,
      ...spacings.mbSm
    },
    privateFundsAmountRow: {
      ...flexbox.directionRow,
      alignItems: 'baseline',
      ...spacings.mbXl
    },
    publicFundsAmountRow: {
      ...flexbox.directionRow,
      alignItems: 'baseline',
      ...spacings.mb
    },
    revealSection: {
      marginTop: 'auto' as unknown as number
    },
    revealLabel: {
      marginBottom: SPACING_TY
    },
    revealLabel2: {
      marginBottom: SPACING_SM
    },
    publicAccountsScroll: {
      maxHeight: 200
    },
    accountRow: {
      borderWidth: 1,
      borderColor: theme.primaryBorder,
      borderRadius: BORDER_RADIUS_PRIMARY,
      ...flexbox.directionRow,
      ...flexbox.justifySpaceBetween,
      ...flexbox.alignCenter,
      ...spacings.phSm,
      ...spacings.pvSm,
      ...spacings.mtSm
    },
    accountRowPressed: {
      backgroundColor: theme.quaternaryBackground
    },
    publicFundsCard: {
      backgroundColor: theme.successBackground
    }
  })

const AccountItem = ({
  name,
  amount,
  isLoading,
  isLoadingPublicBalances,
  styles,
  onPress,
  selected,
  theme
}: {
  name: string
  amount: string
  isLoading: boolean
  isLoadingPublicBalances: boolean
  styles: ReturnType<typeof getStyles>
  onPress?: () => void
  selected?: boolean
  theme: ThemeProps
}) => (
  <Pressable onPress={isLoadingPublicBalances ? undefined : onPress}>
    {({ pressed }) => (
      <View>
        <View
          style={[
            styles.accountRow,
            pressed && onPress && styles.accountRowPressed,
            { backgroundColor: selected ? theme.primaryBackground : 'transparent' }
          ]}
        >
          <Text type="small" weight="medium" appearance="secondaryText">
            {name}
          </Text>
          <Text type="small" weight="number_medium" appearance="primaryText">
            {isLoading ? 'loading...' : amount}
          </Text>
        </View>
      </View>
    )}
  </Pressable>
)

interface Props {
  activeView: ActiveView
  isPrivateLoading: boolean
  privateInteger: string
  privateDecimal: string | undefined
  privatePercent: number
  onSelectPrivate: () => void
  isLoadingPublicBalances: boolean
  publicInteger: string
  publicDecimal: string | undefined
  publicPercent: number
  accounts: { addr: string; preferences: { label: string } }[]
  balanceCache: { [addr: string]: number }
  selectedAccountAddr: string | undefined
  onSelectPublicAccount: (addr: string) => void
}

const FundsCards = ({
  activeView,
  isPrivateLoading,
  privateInteger,
  privateDecimal,
  privatePercent,
  onSelectPrivate,
  isLoadingPublicBalances,
  publicInteger,
  publicDecimal,
  publicPercent,
  accounts,
  balanceCache,
  selectedAccountAddr,
  onSelectPublicAccount
}: Props) => {
  const { styles, theme } = useTheme(getStyles)

  const privateScaleAnim = useRef(new Animated.Value(1)).current
  const publicScaleAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(privateScaleAnim, {
        toValue: activeView === 'public' ? 0.9 : 1,
        duration: 220,
        useNativeDriver: true
      }),
      Animated.timing(publicScaleAnim, {
        toValue: activeView === 'private' ? 0.9 : 1,
        duration: 220,
        useNativeDriver: true
      })
    ]).start()
  }, [activeView, privateScaleAnim, publicScaleAnim])

  return (
    <View style={[flexbox.directionRow, spacings.phMd, spacings.pt, spacings.pb]}>
      <Animated.View style={{ flex: 1, transform: [{ scale: privateScaleAnim }] }}>
        <Pressable
          onPress={onSelectPrivate}
          style={[
            styles.fundsCard,
            {
              flex: 1,
              borderColor:
                activeView === 'private' ? String(theme.featureDecorative) : 'transparent',
              borderWidth: activeView === 'private' ? 2 : 1
            }
          ]}
        >
          <View
            style={{
              position: 'absolute',
              bottom: -20,
              right: -10,
              opacity: 0.07
            }}
            pointerEvents="none"
          >
            <LockIcon width={120} height={170} color={theme.featureDecorative} />
          </View>
          <View style={styles.fundsLabel}>
            <Text
              type="caption"
              weight="medium"
              appearance="secondaryText"
              style={{ letterSpacing: 1 }}
            >
              PRIVATE FUNDS
            </Text>
          </View>
          {isPrivateLoading ? (
            <Text type="small" weight="number_medium" appearance="primaryText">
              Loading...
            </Text>
          ) : (
            <View style={styles.privateFundsAmountRow}>
              <Text fontSize={24} weight="number_bold" shouldScale={false} appearance="primaryText">
                {privateInteger}
              </Text>
              {privateDecimal && (
                <Text
                  fontSize={16}
                  weight="number_bold"
                  shouldScale={false}
                  appearance="secondaryText"
                >
                  .{privateDecimal.slice(0, 2)}
                </Text>
              )}
              <Text
                fontSize={13}
                weight="regular"
                shouldScale={false}
                appearance="secondaryText"
                style={{ marginLeft: SPACING_TY }}
              >
                ({privatePercent}%)
              </Text>
            </View>
          )}
          {activeView === 'public' && (
            <View style={styles.revealSection}>
              <Text
                type="caption"
                weight="number_bold"
                appearance="secondaryText"
                style={styles.revealLabel}
              >
                CLICK TO REVEAL
              </Text>
              <Text
                type="caption"
                weight="number_bold"
                appearance="secondaryText"
                style={styles.revealLabel2}
              >
                YOUR PRIVATE ACCOUNT
              </Text>
            </View>
          )}
        </Pressable>
      </Animated.View>

      <View style={{ width: SPACING_SM }} />

      <Animated.View style={{ flex: 1, transform: [{ scale: publicScaleAnim }] }}>
        <View style={[styles.fundsCard, styles.publicFundsCard, { flex: 1 }]}>
          <View style={styles.fundsLabel}>
            <Text
              type="caption"
              weight="medium"
              appearance="secondaryText"
              style={{ letterSpacing: 1 }}
            >
              PUBLIC FUNDS
            </Text>
          </View>
          {isLoadingPublicBalances ? (
            <Text type="small" weight="number_medium" appearance="primaryText">
              Loading...
            </Text>
          ) : (
            <View style={styles.publicFundsAmountRow}>
              <Text fontSize={24} weight="number_bold" shouldScale={false} appearance="primaryText">
                {publicInteger}
              </Text>
              {publicDecimal && (
                <Text
                  fontSize={16}
                  weight="number_bold"
                  shouldScale={false}
                  appearance="secondaryText"
                >
                  .{publicDecimal.slice(0, 2)}
                </Text>
              )}
              <Text
                fontSize={13}
                weight="regular"
                shouldScale={false}
                appearance="secondaryText"
                style={{ marginLeft: SPACING_TY }}
              >
                ({publicPercent}%)
              </Text>
            </View>
          )}
          <ScrollView
            style={styles.publicAccountsScroll}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {accounts.map((acc, index) => {
              const cachedBal = balanceCache[acc.addr]
              const isLoading = cachedBal == null
              const balDisplay = !isLoading ? formatDecimals(cachedBal, 'value') : ''

              return (
                <AccountItem
                  key={acc.addr}
                  name={acc.preferences.label || `ACCT ${index + 1}`}
                  amount={balDisplay}
                  selected={activeView === 'public' && selectedAccountAddr === acc.addr}
                  theme={theme}
                  isLoading={isLoading}
                  styles={styles}
                  onPress={() => onSelectPublicAccount(acc.addr)}
                  isLoadingPublicBalances={isLoadingPublicBalances}
                />
              )
            })}
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  )
}

export default FundsCards
