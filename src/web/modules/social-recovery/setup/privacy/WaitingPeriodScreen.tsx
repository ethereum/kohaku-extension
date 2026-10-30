import React from 'react'

import SettingsChrome from './SettingsChrome'
import WaitingPeriodView from './WaitingPeriodView'

const WaitingPeriodScreen = () => <SettingsChrome step={WaitingPeriodView} stage={3} />

export default React.memo(WaitingPeriodScreen)
