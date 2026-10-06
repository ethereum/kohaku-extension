import React from 'react'

import SettingsChrome from './SettingsChrome'
import WaitingPeriodView from './WaitingPeriodView'

const WaitingPeriodScreen = () => <SettingsChrome step={WaitingPeriodView} />

export default React.memo(WaitingPeriodScreen)
