import React, { FC } from 'react'
import { Control } from 'react-hook-form'
import { View } from 'react-native'

import useTheme from '@common/hooks/useTheme'
import { TabType } from '@web/modules/PPv1/screens/dashboard/components/TabsAndSearch/Tabs/Tab/Tab'
import Tabs from '@web/modules/PPv1/screens/dashboard/components/TabsAndSearch/Tabs/Tabs'
import flexbox from '@common/styles/utils/flexbox'
import { useSearchParams } from 'react-router-dom'

import ActivitySearch from '../ActivitySearch'
import { ActivityFilterType } from '../types'

import getStyles from './styles'

interface Props {
  openTab: TabType
  setOpenTab: React.Dispatch<React.SetStateAction<TabType>>
  searchControl: Control<any>
  sessionId: string
  filterType: ActivityFilterType
  setFilterType: (type: ActivityFilterType) => void
}

const ActivityFilter: FC<Props> = ({
  openTab,
  setOpenTab,
  searchControl,
  sessionId,
  filterType,
  setFilterType
}) => {
  const [, setSearchParams] = useSearchParams()
  const { styles } = useTheme(getStyles)

  return (
    <View style={styles.container}>
      <View
        style={[
          flexbox.directionRow,
          flexbox.justifySpaceBetween,
          flexbox.alignCenter,
          { width: '100%' }
        ]}
      >
        <Tabs
          handleChangeQuery={(tab) => setSearchParams({ tab, sessionId })}
          setOpenTab={setOpenTab}
          openTab={openTab}
        />
        <ActivitySearch
          control={searchControl}
          filterType={filterType}
          setFilterType={setFilterType}
          placeholder="Search activity..."
          height={32}
          hasLeftIcon
          borderWrapperStyle={styles.borderWrapper}
          inputWrapperStyle={styles.searchInputWrapper}
        />
      </View>
    </View>
  )
}

export default React.memo(ActivityFilter)
