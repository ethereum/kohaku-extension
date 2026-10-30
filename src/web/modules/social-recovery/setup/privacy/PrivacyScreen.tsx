import React from 'react'

import PrivacyView from './PrivacyView'
import SettingsChrome from './SettingsChrome'

const PrivacyScreen = () => <SettingsChrome step={PrivacyView} stage={4} />

export default React.memo(PrivacyScreen)
