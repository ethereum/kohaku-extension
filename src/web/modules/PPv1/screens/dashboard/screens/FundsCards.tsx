import React from 'react'
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native'

import AddIcon from '@common/assets/svg/AddIcon'
import RightArrowIcon from '@common/assets/svg/RightArrowIcon'
import CopyText from '@common/components/CopyText'
import Text from '@common/components/Text/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { ThemeProps } from '@common/styles/themeConfig'
import { BORDER_RADIUS_SECONDARY } from '@common/styles/utils/common'
import flexbox from '@common/styles/utils/flexbox'
import Avatar from '@common/components/Avatar'
import { isSmartAccount } from '@ambire-common/libs/account/account'
import { Account } from '@ambire-common/interfaces/account'
import useRailgunControllerState from '@web/hooks/useRailgunControllerState'
import { useModalize } from 'react-native-modalize'
import BottomSheet from '@common/components/BottomSheet'
import { getUiType } from '@web/utils/uiType'
import AddAccount from '@web/modules/account-select/components/AddAccount'
import RefreshIcon from '@common/modules/dashboard/components/DashboardOverview/RefreshIcon'
import NewDisplayBalance from './DisplayBalance'
import { ActiveView } from './types'

const { isPopup } = getUiType()

function AddPublicAccount({ activeView }: { activeView: ActiveView }) {
  const { ref: sheetRef, open: openBottomSheet, close: closeBottomSheet } = useModalize()

  return (
    <>
      <Pressable onPress={() => openBottomSheet()}>
        <Text
          fontSize={11}
          weight="regular"
          style={{
            // color: activeView === 'private' ? '#F9F6E9' : '#000000',
            color: '#F9F6E9',
            backgroundColor: '#00577D33',
            paddingHorizontal: 8,
            borderRadius: 18
          }}
        >
          Add account
        </Text>
      </Pressable>
      <BottomSheet
        id="account-select-add-account"
        sheetRef={sheetRef}
        adjustToContentHeight={isPopup}
        closeBottomSheet={closeBottomSheet}
        scrollViewProps={{ showsVerticalScrollIndicator: false }}
      >
        <AddAccount handleClose={closeBottomSheet as any} />
      </BottomSheet>
    </>
  )
}

const CARD_SHADOW = {
  // iOS
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  // shadowOpacity: 0.1,  // 0x1A = 26 → 26/255 ≈ 0.1
  shadowRadius: 10,

  // Android
  elevation: 4
}

const ADD_MONEY_SHADOW = {
  // iOS
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 5.33 },
  shadowOpacity: 0.1,
  shadowRadius: 10.67,

  // Android
  elevation: 4
}

interface Style {
  card: ViewStyle
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getStyles = (theme: ThemeProps) =>
  StyleSheet.create<Style>({
    card: {
      flex: 1,
      borderRadius: BORDER_RADIUS_SECONDARY,
      padding: 16,
      overflow: 'hidden'
    }
  })

interface Props {
  activeView: ActiveView
  changeView: (view: ActiveView) => void
  privateInteger: string
  privateDecimal: string | undefined
  publicInteger: string
  publicDecimal: string | undefined
  onAddMoney: () => void
  accounts: Account[]
  handleRetryLoadPrivateAccount: () => void
}

const NewFundsCards = ({
  activeView,
  privateInteger,
  privateDecimal,
  publicInteger,
  publicDecimal,
  changeView,
  onAddMoney,
  accounts,
  handleRetryLoadPrivateAccount
}: Props) => {
  const MAX_SHOWN_PUBLIC_ACCOUNTS = 5
  const { styles, theme } = useTheme(getStyles)
  const { zkAddress: railgunAddress } = useRailgunControllerState()

  const truncatedAddr = railgunAddress
    ? `${railgunAddress.slice(0, 8)}...${railgunAddress.slice(-4)}`
    : '---'

  return (
    <View style={[!isPopup && flexbox.directionRow, spacings.pvSm]}>
      <Pressable
        onPress={() => changeView('private')}
        style={[
          styles.card,
          isPopup ? spacings.mbMd : spacings.mrLg,
          {
            // backgroundColor: activeView === 'private' ? '#04364D' : '#F9F6E9',
            // backgroundColor: '#04364D',
            backgroundColor: activeView === 'private' ? '#021B26' : '#04364D',
            borderWidth: 1,
            // borderColor: activeView === 'private' ? '#097DB2' : '#D9D6CB',
            // borderColor: '#097DB2',
            borderColor: activeView === 'private' ? '#009D12' : '#097DB2',
            ...(activeView === 'private' && { ...CARD_SHADOW, shadowOpacity: 0.1 })
          }
        ]}
      >
        <View
          style={[
            flexbox.directionRow,
            flexbox.justifySpaceBetween,
            flexbox.alignCenter,
            spacings.mbTy
          ]}
        >
          <Text
            fontSize={16}
            weight="number_regular"
            // color={activeView === 'private' ? '#F9F6E9' : '#7F7F7F'}
            color="#F9F6E9"
            style={[{ letterSpacing: 0.5 }]}
          >
            Private balance
          </Text>
          <Pressable
            onPress={onAddMoney}
            style={[
              flexbox.directionRow,
              flexbox.center,
              spacings.pvMi,
              spacings.phSm,
              {
                // backgroundColor: activeView === 'private' ? '#F9F6E933' : '#04364D',
                backgroundColor: '#F9F6E933',
                borderRadius: BORDER_RADIUS_SECONDARY,
                borderColor: activeView === 'private' ? '#F9F6E933' : 'transparent',
                borderWidth: 1,
                ...(activeView === 'public' && ADD_MONEY_SHADOW)
              }
            ]}
          >
            <AddIcon
              width={11}
              height={11}
              color={activeView === 'private' ? '#F9F6E9' : '#F9F6E9'}
            />
            <Text
              fontSize={11}
              weight="medium"
              color={activeView === 'private' ? '#F9F6E9' : '#F9F6E9'}
              style={[spacings.mlMi]}
            >
              Add money
            </Text>
          </Pressable>
        </View>

        <View style={[flexbox.directionRow, flexbox.alignCenter, spacings.mb, spacings.mtTy]}>
          <Text
            fontSize={11}
            appearance="secondaryText"
            style={{
              color: '#7F7F7F'
            }}
          >
            {truncatedAddr}
          </Text>
          {railgunAddress && (
            <CopyText
              text={railgunAddress}
              iconColor="#7F7F7F"
              style={{
                ...spacings.mlMi
              }}
            />
          )}
        </View>

        <View
          // style={[flexbox.directionRow, flexbox.justifySpaceBetween, { alignItems: 'baseline' }]}
          style={[flexbox.directionRow, { alignItems: 'baseline' }]}
        >
          <NewDisplayBalance
            activeView={activeView}
            integer={privateInteger}
            decimal={privateDecimal}
          />
          <Pressable
            onPress={handleRetryLoadPrivateAccount}
            style={[spacings.mlTy, { marginRight: 'auto' }]}
          >
            <RefreshIcon width={12} height={12} color={String(theme.secondaryText)} />
          </Pressable>
          <RightArrowIcon width={8} height={14} color={String(theme.iconSecondary)} />
        </View>
      </Pressable>

      <Pressable
        onPress={() => changeView('public')}
        style={[
          styles.card,
          {
            // backgroundColor: activeView === 'private' ? '#021B26' : '#FFFCEF',
            // backgroundColor: '#021B26',
            backgroundColor: activeView === 'public' ? '#021B26' : '#04364D',
            borderWidth: 1,
            // borderColor: activeView === 'public' ? '#009D12' : 'transparent',
            borderColor: activeView === 'public' ? '#009D12' : '#097DB2',
            ...(activeView === 'public' && { ...CARD_SHADOW, shadowOpacity: 0.08 })
          }
        ]}
      >
        <View
          style={[
            flexbox.directionRow,
            flexbox.justifySpaceBetween,
            flexbox.alignCenter,
            spacings.mbTy
          ]}
        >
          <Text
            fontSize={16}
            weight="number_regular"
            // color={activeView === 'private' ? '#F9F6E9' : '#7F7F7F'}
            color="#F9F6E9"
            style={[{ letterSpacing: 0.5 }]}
          >
            Public balance
          </Text>
          <AddPublicAccount activeView={activeView} />
        </View>

        <View style={[flexbox.directionRow, spacings.mb]}>
          {accounts.slice(0, MAX_SHOWN_PUBLIC_ACCOUNTS).map((acc, index) => {
            return (
              <View
                key={acc.addr}
                style={{
                  marginLeft: index === 0 ? 0 : -15
                }}
              >
                <Avatar pfp={acc.preferences.pfp} size={30} isSmart={isSmartAccount(acc)} />
              </View>
            )
          })}
        </View>

        {/* <View style={[flexbox.directionRow, spacings.mb]}>
          {accounts.slice(0, 5).map((acc, i) => (
            <View
              key={acc.addr}
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: TOKEN_COLORS[i % TOKEN_COLORS.length],
                marginLeft: i > 0 ? -6 : 0,
                borderWidth: 1,
                borderColor: String(theme.successBackground)
              }}
            />
          ))}
        </View> */}

        <View
          style={[
            flexbox.directionRow,
            flexbox.justifySpaceBetween,
            { alignItems: 'baseline', marginTop: 'auto' }
          ]}
        >
          <NewDisplayBalance
            activeView={activeView}
            integer={publicInteger}
            decimal={publicDecimal}
          />
          <RightArrowIcon width={8} height={14} color={String(theme.iconSecondary)} />
        </View>
      </Pressable>
    </View>
  )
}

export default NewFundsCards
