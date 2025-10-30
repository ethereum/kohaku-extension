import './shim'

import './global'
import './src/common/config/analytics/CrashAnalytics'
import './src/common/services/layoutAnimation'
import 'react-native-gesture-handler'
import 'expo-asset'
import 'setimmediate'

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { registerRootComponent } from 'expo'

import { LogBox, Platform } from 'react-native'

LogBox.ignoreLogs([
  // Ignore the Android specific warnings for setting long timers
  // {@link https://stackoverflow.com/a/64832663/1333836}
  'Setting a timer',
  // Ignores the warning: "ViewPropTypes will be removed from React Native.
  // Migrate to ViewPropTypes exported from 'deprecated-react-native-prop-types'."
  // It is coming from the "lottie-react-native" package.
  // Updating it to v5.1.3 removes the warn, but the "expected version"
  // (based on expo doctor) is v5.0.1. Therefore, we keep using v5.0.1 for now,
  // and ignore the warning temporarily.
  "exported from 'deprecated-react-native-prop-types'."
])

// eslint-disable-next-line
import App from './App'

if (Platform.OS === 'web') {
  // Fixes ReactDOM.render error
  // https://github.com/expo/expo/issues/18485
  const rootTag = createRoot(document.getElementById('root') ?? document.getElementById('main'))
  rootTag.render(createElement(App))
} else {
  // registerRootComponent calls AppRegistry.registerComponent('main', () => App);
  // It also ensures that whether you load the app in Expo Go or in a native build,
  // the environment is set up appropriately
  // registerRootComponent(App)
  registerRootComponent(App)
}
