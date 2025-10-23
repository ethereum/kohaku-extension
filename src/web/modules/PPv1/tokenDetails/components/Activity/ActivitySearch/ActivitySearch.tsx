import React, { useState, useRef, useEffect } from 'react'
import { Control, Controller } from 'react-hook-form'
import { View, ViewStyle, Pressable } from 'react-native'

import CloseIcon from '@common/assets/svg/CloseIcon'
import SearchIcon from '@common/assets/svg/SearchIcon'
import Input, { InputProps } from '@common/components/Input'
import Text from '@common/components/Text'
import useTheme from '@common/hooks/useTheme'
import spacings from '@common/styles/spacings'
import { useTranslation } from 'react-i18next'

import { ActivityFilterType } from '../types'
import getStyles from './styles'

interface Props extends InputProps {
  placeholder?: string
  style?: ViewStyle
  containerStyle?: ViewStyle
  inputWrapperStyle?: ViewStyle
  control: Control<{ search: string }, any>
  height?: number
  hasLeftIcon?: boolean
  onSearchCleared?: () => void
  filterType: ActivityFilterType
  setFilterType: (type: ActivityFilterType) => void
}

const ActivitySearch = ({
  placeholder = 'Search',
  style,
  control,
  containerStyle = {},
  inputWrapperStyle = {},
  height = 40,
  hasLeftIcon = true,
  onSearchCleared,
  filterType,
  setFilterType,
  ...rest
}: Props) => {
  const { theme, styles } = useTheme(getStyles)
  const { t } = useTranslation()
  const [isFocused, setIsFocused] = useState(false)
  const containerRef = useRef<any>(null)

  // Scale the clear search icon size based on the height of the search input
  const clearSearchIconSize = Math.min(Math.floor(height / 2.5), 12)

  const handleFilterClick = (type: ActivityFilterType) => {
    // Toggle off if clicking the same filter
    if (filterType === type) {
      setFilterType('all')
    } else {
      setFilterType(type)
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <View ref={containerRef} style={styles.wrapper}>
      <Controller
        control={control}
        name="search"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            containerStyle={[spacings.mb0, containerStyle]}
            leftIcon={hasLeftIcon ? () => <SearchIcon color={theme.secondaryText} /> : undefined}
            placeholder={placeholder}
            style={style}
            inputWrapperStyle={[{ height }, inputWrapperStyle]}
            inputStyle={{ height: height - 2 }}
            placeholderTextColor={theme.secondaryText}
            onBlur={() => {
              onBlur()
              // Don't immediately hide - let handleClickOutside handle it
            }}
            onFocus={() => setIsFocused(true)}
            onChange={onChange}
            value={value}
            button={
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {/* Filter indicator - always visible when filter is active */}
                {filterType !== 'all' && (
                  <Text fontSize={11} weight="medium" color={theme.secondaryText}>
                    ({filterType})
                  </Text>
                )}
                {/* Clear search icon */}
                <View
                  style={{
                    width: clearSearchIconSize,
                    height: clearSearchIconSize
                  }}
                >
                  {!!value && (
                    <CloseIcon width={clearSearchIconSize} height={clearSearchIconSize} />
                  )}
                </View>
              </View>
            }
            buttonStyle={{
              ...spacings.pv0,
              ...spacings.ph0,
              ...spacings.mrSm
            }}
            onButtonPress={() => {
              if (!value) return
              onChange('')
              if (onSearchCleared) onSearchCleared()
            }}
            testID="search-input"
            {...rest}
          />
        )}
      />

      {/* Filter Pills - Show when focused */}
      {isFocused && (
        <View style={styles.pillsContainer}>
          <Pressable
            onPress={() => handleFilterClick('send')}
            style={[styles.pill, filterType === 'send' && styles.pillActive]}
          >
            <Text
              fontSize={12}
              weight="medium"
              color={filterType === 'send' ? theme.primary : theme.secondaryText}
            >
              {t('Send')}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => handleFilterClick('deposit')}
            style={[styles.pill, filterType === 'deposit' && styles.pillActive]}
          >
            <Text
              fontSize={12}
              weight="medium"
              color={filterType === 'deposit' ? theme.primary : theme.secondaryText}
            >
              {t('Deposit')}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

export default React.memo(ActivitySearch)
