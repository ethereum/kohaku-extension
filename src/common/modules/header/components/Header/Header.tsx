import React, { ReactNode, useEffect, useMemo, useState } from 'react'
import { Image, View, ViewStyle } from 'react-native'

import Text from '@common/components/Text'
import { titleChangeEventStream } from '@common/hooks/useNavigation'
import useRoute from '@common/hooks/useRoute'
import useTheme from '@common/hooks/useTheme'
import useWindowSize from '@common/hooks/useWindowSize'
import BackButton, { DisplayIn } from '@common/modules/header/components/HeaderBackButton'
import routesConfig from '@common/modules/router/config/routesConfig'
import spacings, { SPACING_3XL, SPACING_MD } from '@common/styles/spacings'
import flexbox from '@common/styles/utils/flexbox'
import { tabLayoutWidths } from '@web/components/TabLayoutWrapper'
import { getUiType } from '@web/utils/uiType'

import KohakuLogo from '@common/components/HokahuLogo'
import getStyles from './styles'

interface Props {
  mode?: 'title' | 'image-and-title' | 'custom-inner-content' | 'custom'
  customTitle?: string | ReactNode
  displayBackButtonIn?: DisplayIn | DisplayIn[]
  withAmbireLogo?: boolean
  withOG?: boolean
  image?: string
  children?: any
  backgroundColor?: string
  forceBack?: boolean
  onGoBackPress?: () => void
  width?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  style?: ViewStyle
}

const { isTab, isActionWindow } = getUiType()

const Header = ({
  mode = 'title',
  customTitle,
  displayBackButtonIn,
  withAmbireLogo,
  withOG,
  children,
  backgroundColor,
  forceBack,
  onGoBackPress,
  image,
  width = 'xl',
  style
}: Props) => {
  const { styles } = useTheme(getStyles)

  const { path } = useRoute()
  const { maxWidthSize } = useWindowSize()

  const [title, setTitle] = useState('')

  useEffect(() => {
    if (!path) return

    const nextRoute = path?.substring(1)
    setTitle((routesConfig as any)?.[nextRoute]?.title || '')
  }, [path])

  useEffect(() => {
    const subscription = titleChangeEventStream!.subscribe({ next: (v) => setTitle(v) })
    return () => subscription.unsubscribe()
  }, [])

  const paddingHorizontalStyle = useMemo(() => {
    if (isTab || isActionWindow) {
      return {
        paddingHorizontal: maxWidthSize('xl') ? SPACING_3XL : SPACING_MD
      }
    }

    return spacings.ph
  }, [maxWidthSize])

  return (
    <View
      style={[
        styles.container,
        paddingHorizontalStyle,
        !!backgroundColor && { backgroundColor },
        style
      ]}
    >
      {mode !== 'custom' ? (
        <View style={[styles.widthContainer, { maxWidth: tabLayoutWidths[width] }]}>
          <View style={styles.sideContainer}>
            <BackButton
              displayIn={displayBackButtonIn}
              onGoBackPress={onGoBackPress}
              forceBack={forceBack}
            />
          </View>
          {/* Middle content start */}
          {mode === 'title' && (
            <View style={styles.containerInner}>
              <Text
                weight="regular"
                fontSize={isTab ? 32 : 24}
                style={styles.title}
                numberOfLines={2}
              >
                {customTitle || title || ''}
              </Text>
            </View>
          )}
          {mode === 'image-and-title' && (
            <View style={styles.imageAndTitleContainer}>
              {image && <Image source={{ uri: image }} style={styles.image} />}
              <Text weight="medium" fontSize={20}>
                {customTitle || title}
              </Text>
            </View>
          )}
          {mode === 'custom-inner-content' && <View style={styles.containerInner}>{children}</View>}
          {/* Middle content end */}
          {!!withAmbireLogo && (
            <View style={[styles.sideContainer, flexbox.alignEnd]}>
              <KohakuLogo width={72} />
            </View>
          )}
        </View>
      ) : (
        children
      )}
    </View>
  )
}

export default React.memo(Header)
