import React from 'react'

import PrivacyView from './PrivacyView'
import SettingsChrome from './SettingsChrome'

const PrivacyScreen = () => <SettingsChrome step={PrivacyView} />

export default React.memo(PrivacyScreen)
