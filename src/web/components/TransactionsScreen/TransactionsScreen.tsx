import React, { FC, useMemo } from 'react'
import { View } from 'react-native'

import { isSmartAccount } from '@ambire-common/libs/account/account'
import AccountAddress from '@common/components/AccountAddress'
import AccountBadges from '@common/components/AccountBadges'
import Avatar from '@common/components/Avatar'
import DomainBadge from '@common/components/Avatar/DomainBadge'
import Text from '@common/components/Text'
import useReverseLookup from '@common/hooks/useReverseLookup'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import Header from '@common/modules/header/components/Header'
import getHeaderStyles from '@common/modules/header/components/Header/styles'
import HeaderBackButton from '@common/modules/header/components/HeaderBackButton'
import spacings from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { TabLayoutContainer, TabLayoutWrapperMainContent } from '@web/components/TabLayoutWrapper'
import {
  getTabLayoutPadding,
  tabLayoutWidths
} from '@web/components/TabLayoutWrapper/TabLayoutWrapper'
import useSelectedAccountControllerState from '@web/hooks/useSelectedAccountControllerState'
import { getUiType } from '@web/utils/uiType'

import KohakuLogo from '@common/components/HokahuLogo'
import getStyles from './styles'

const { isTab } = getUiType()

type WrapperProps = {
  children: React.ReactNode
  title: string | React.ReactNode
  description?: string
  handleGoBack: () => void
  buttons: React.ReactNode
}

type ContentProps = {
  children: React.ReactNode
  buttons: React.ReactNode
  scrollViewRef?: React.RefObject<any>
}

type FormProps = {
  children: React.ReactNode
}

const Wrapper: FC<WrapperProps> = ({ children, title, description, handleGoBack, buttons }) => {
  const { theme, styles } = useTheme(getStyles)
  const { styles: headerStyles } = useTheme(getHeaderStyles)
  const { account } = useSelectedAccountControllerState()
  const { isLoading, ens } = useReverseLookup({ address: account?.addr || '' })

  return (
    <TabLayoutContainer
      backgroundColor={theme.secondaryBackground}
      // backgroundColor="#f30"
      // header={null}
      containerStyle={{}}
      // header={
      //   <Header mode="custom">
      //     <View
      //       style={[
      //         headerStyles.widthContainer,
      //         { maxWidth: tabLayoutWidths.xl, ...flexbox.justifySpaceBetween }
      //       ]}
      //     >
      //       <View
      //         style={[
      //           styles.headerSideContainer,
      //           flexbox.justifySpaceBetween,
      //           flexbox.directionRow,
      //           flexbox.flex1
      //         ]}
      //       >
      //         <View>
      //           <KohakuLogo width={72} />
      //         </View>
      //         <Text fontSize={16} style={{ color: theme.textPrimary }}>
      //           How does Kohaku work?
      //         </Text>
      //       </View>
      //       {/* <View style={styles.headerSideContainer}>
      //         {isTab && account && (
      //           <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.flex1]}>
      //             <Avatar pfp={account.preferences.pfp} isSmart={isSmartAccount(account)} />
      //             <View style={flexbox.flex1}>
      //               <View style={[flexbox.flex1, flexbox.directionRow]}>
      //                 <Text fontSize={16} weight="medium" numberOfLines={1}>
      //                   {account.preferences.label}
      //                 </Text>

      //                 <AccountBadges accountData={account} />
      //               </View>
      //               <View style={[flexbox.directionRow, flexbox.alignCenter]}>
      //                 <DomainBadge ens={ens} />
      //                 <AccountAddress
      //                   isLoading={isLoading}
      //                   ens={ens}
      //                   address={account.addr}
      //                   plainAddressMaxLength={18}
      //                 />
      //               </View>
      //             </View>
      //           </View>
      //         )}
      //         {!isTab && <HeaderBackButton forceBack onGoBackPress={handleGoBack} />}
      //       </View> */}
      //       {/* <View style={[styles.headerSideContainer, { alignItems: 'flex-end' }]}>
      //         <KohakuLogo width={72} />
      //       </View> */}
      //     </View>
      //   </Header>
      // }
      withHorizontalPadding={false}
      footer={isTab ? buttons : null}
    >
      <View style={[flexbox.center, flexbox.flex1]}>
        <Header mode="custom">
          <View
            style={[
              headerStyles.widthContainer,
              { maxWidth: tabLayoutWidths.xl, ...flexbox.justifySpaceBetween }
            ]}
          >
            <View
              style={[
                styles.headerSideContainer,
                flexbox.justifySpaceBetween,
                flexbox.directionRow,
                flexbox.flex1
              ]}
            >
              <View>
                <KohakuLogo width={72} />
              </View>
              <Text fontSize={16} style={{ color: theme.textPrimary }}>
                How does Kohaku work?
              </Text>
            </View>
            {/* <View style={styles.headerSideContainer}>
              {isTab && account && (
                <View style={[flexbox.directionRow, flexbox.alignCenter, flexbox.flex1]}>
                  <Avatar pfp={account.preferences.pfp} isSmart={isSmartAccount(account)} />
                  <View style={flexbox.flex1}>
                    <View style={[flexbox.flex1, flexbox.directionRow]}>
                      <Text fontSize={16} weight="medium" numberOfLines={1}>
                        {account.preferences.label}
                      </Text>

                      <AccountBadges accountData={account} />
                    </View>
                    <View style={[flexbox.directionRow, flexbox.alignCenter]}>
                      <DomainBadge ens={ens} />
                      <AccountAddress
                        isLoading={isLoading}
                        ens={ens}
                        address={account.addr}
                        plainAddressMaxLength={18}
                      />
                    </View>
                  </View>
                </View>
              )}
              {!isTab && <HeaderBackButton forceBack onGoBackPress={handleGoBack} />}
            </View> */}
            {/* <View style={[styles.headerSideContainer, { alignItems: 'flex-end' }]}>
              <KohakuLogo width={72} />
            </View> */}
          </View>
        </Header>
        {title && (
          <View style={{ marginBottom: -16 }}>
            <Text fontSize={isTab ? 24 : 20} weight="medium" style={{ textAlign: 'center' }}>
              {title}
            </Text>
            {description && (
              <Text fontSize={14} color={theme.muted} style={{ textAlign: 'center' }}>
                {description}
              </Text>
            )}
          </View>
        )}
        {children}
      </View>
    </TabLayoutContainer>
  )
}

const Content: FC<ContentProps> = ({ children, buttons, scrollViewRef }) => {
  const { styles } = useTheme(getStyles)
  const { maxWidthSize, minHeightSize } = useWindowSize()
  const paddingHorizontalStyle = useMemo(() => getTabLayoutPadding(maxWidthSize), [maxWidthSize])

  return (
    <TabLayoutWrapperMainContent
      withScroll={false}
      contentContainerStyle={{
        ...spacings.pv0,
        ...paddingHorizontalStyle,
        ...spacings.pb
        // ...(isTab ? (minHeightSize('m') ? {} : spacings.pt2Xl) : {}),
        // flexGrow: 1,
        // backgroundColor: "brown",
      }}
      wrapperRef={scrollViewRef}
    >
      <View style={[styles.container]}>
        {children}
        {/* {!isTab && <View style={styles.nonTabButtons}>{buttons}</View>} */}
        <View style={styles.nonTabButtons}>{buttons}</View>
      </View>
    </TabLayoutWrapperMainContent>
  )
}

const Form: FC<FormProps> = ({ children }) => {
  const { styles } = useTheme(getStyles)

  return <View style={styles.form}>{children}</View>
}

export { Wrapper, Content, Form }
