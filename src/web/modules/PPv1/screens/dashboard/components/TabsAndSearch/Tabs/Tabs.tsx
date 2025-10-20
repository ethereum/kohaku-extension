import React from 'react'
import { View } from 'react-native'

import useTheme from '@common/hooks/useTheme'
import flexbox from '@common/styles/utils/flexbox'

import getStyles from './styles'
import Tab from './Tab'
import { TabType } from './Tab/Tab'

interface Props {
  openTab: TabType
  setOpenTab: React.Dispatch<React.SetStateAction<TabType>>
  handleChangeQuery: (openTab: string) => void
}

const TABS: {
  type: TabType
  tabLabel: string
  disabled?: boolean
  testID?: string
}[] = [
  {
    testID: 'tab-tokens',
    type: 'tokens',
    tabLabel: 'Tokens'
  },
  {
    testID: 'tab-activity',
    type: 'activity',
    tabLabel: 'Activity'
  }
  // {
  //   testID: 'tab-deposits',
  //   type: 'deposits',
  //   tabLabel: 'Deposits'
  // },
  // {
  //   testID: 'tab-send',
  //   type: 'sends',
  //   tabLabel: 'Sends'
  // }
]

const Tabs: React.FC<Props> = ({ openTab, setOpenTab, handleChangeQuery }) => {
  const { styles, theme } = useTheme(getStyles)

  return (
    <View style={styles.container}>
      {TABS.map(({ type, tabLabel, disabled, testID }, tabIndex) => {
        const openTabIndex = TABS.findIndex((t) => t.type === openTab)
        const indexDiff = tabIndex - openTabIndex

        return (
          <View key={type} style={[flexbox.directionRow, flexbox.alignCenter]}>
            <Tab
              testID={testID}
              openTab={openTab}
              tab={type}
              tabLabel={tabLabel}
              setOpenTab={setOpenTab}
              handleChangeQuery={handleChangeQuery}
              disabled={disabled}
            />
            {tabIndex !== TABS.length - 1 && (
              <View
                style={{
                  borderRightWidth: 1,
                  height: 24,
                  borderRightColor:
                    indexDiff >= 1 || indexDiff < -1 ? theme.secondaryBorder : 'transparent'
                }}
              />
            )}
          </View>
        )
      })}
    </View>
  )
}

export default React.memo(Tabs)
