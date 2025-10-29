import { TFunction } from 'i18next'
import React, { FC, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { View } from 'react-native'
import { useSearchParams } from 'react-router-dom'

import SearchIcon from '@common/assets/svg/SearchIcon'
import Search from '@common/components/Search'
import useTheme from '@common/hooks/useTheme'
import { TabType } from '@web/modules/PPv1/screens/dashboard/components/TabsAndSearch/Tabs/Tab/Tab'
import Tabs from '@web/modules/PPv1/screens/dashboard/components/TabsAndSearch/Tabs/Tabs'
import useBanners from '@web/modules/PPv1/screens/dashboard/hooks/useBanners'
import spacings from '@common/styles/spacings'
import { THEME_TYPES } from '@common/styles/themeConfig'
import flexbox from '@common/styles/utils/flexbox'
import { AnimatedPressable, useMultiHover } from '@web/hooks/useHover'
import DURATIONS from '@web/hooks/useHover/durations'
import { getUiType } from '@web/utils/uiType'

import SelectNetwork from './SelectNetwork'
import getStyles from './styles'

const { isPopup } = getUiType()

const getSearchPlaceholder = (openTab: TabType, t: TFunction) => {
  if (isPopup) {
    return t('Search')
  }

  if (openTab === 'activity') return t('Search for activity')
  if (openTab === 'deposits') return t('Search for deposits')
  if (openTab === 'sends') return t('Search for sends')

  return t('Search')
}

interface Props {
  openTab: TabType
  setOpenTab: React.Dispatch<React.SetStateAction<TabType>>
  searchControl?: any
  sessionId: string
}

const TABS = ['tokens', 'activity', 'transfers', 'deposits']

const TabsAndSearch: FC<Props> = ({ openTab, setOpenTab, searchControl, sessionId }) => {
  const [, setSearchParams] = useSearchParams()
  const searchRef = useRef<any>(null)
  const searchButtonRef = useRef<any>(null)
  const { styles, theme, themeType } = useTheme(getStyles)
  const { t } = useTranslation()
  const [controllerBanners] = useBanners()
  const [isSearchVisible, setIsSearchVisible] = useState(false)
  const [bindControlPositionAnim, controlPositionStyles] = useMultiHover({
    values: [
      {
        property: 'backgroundColor',
        from: theme.secondaryBackground,
        to: themeType === THEME_TYPES.DARK ? '#1b2b2c' : theme.tertiaryBackground,
        duration: DURATIONS.REGULAR
      },
      {
        property: 'borderColor',
        from: theme.secondaryBorder,
        to: theme.tertiaryText,
        duration: DURATIONS.REGULAR
      }
    ]
  })

  const toggleSearchVisibility = () => {
    setIsSearchVisible((prev) => !prev)
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Don't close the search if the user clicked on the search button because
      // the button toggles the search visibility.
      const clickedToOpenSearch =
        searchButtonRef.current && searchButtonRef.current.contains(e.target as Node)
      const clickedOnSearch = searchRef.current && searchRef.current.contains(e.target as Node)

      if (!isSearchVisible || clickedToOpenSearch || clickedOnSearch) return

      setIsSearchVisible(false)
    }

    window.addEventListener('mousedown', onClick)

    return () => {
      window.removeEventListener('mousedown', onClick)
    }
  }, [isSearchVisible])

  return (
    <View style={[styles.container, !!controllerBanners.length && spacings.ptTy]}>
      <Tabs
        handleChangeQuery={(tab) => setSearchParams({ tab, sessionId })}
        setOpenTab={setOpenTab}
        openTab={openTab}
      />
      {TABS.includes(openTab) && (
        <View style={[flexbox.directionRow, flexbox.justifySpaceBetween, flexbox.alignCenter]}>
          <SelectNetwork />
          {searchControl && (
            <AnimatedPressable
              onPress={toggleSearchVisibility}
              ref={searchButtonRef}
              style={[
                styles.searchIconWrapper,
                controlPositionStyles,
                {
                  ...(isSearchVisible && {
                    borderColor: theme.primary,
                    backgroundColor: theme.infoBackground
                  })
                }
              ]}
              onHoverIn={bindControlPositionAnim.onHoverIn}
              onHoverOut={bindControlPositionAnim.onHoverOut}
            >
              <SearchIcon
                color={themeType === THEME_TYPES.DARK ? theme.primary : theme.tertiaryText}
                width={16}
              />
            </AnimatedPressable>
          )}
          {isSearchVisible && (
            <View style={[styles.searchContainer]} ref={searchRef}>
              <Search
                autoFocus
                borderWrapperStyle={styles.borderWrapper}
                inputWrapperStyle={styles.searchInputWrapper}
                control={searchControl}
                height={32}
                placeholder={getSearchPlaceholder(openTab, t)}
                hasLeftIcon={false}
                onSearchCleared={toggleSearchVisibility}
              />
            </View>
          )}
        </View>
      )}
    </View>
  )
}

export default React.memo(TabsAndSearch)
