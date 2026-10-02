const path = require('path')
const baseConfig = require('./src/ambire-common/jest.config.js')

module.exports = {
  ...baseConfig,
  displayName: 'Ambire Extension Unit Tests',
  testPathIgnorePatterns: [
    path.join('<rootDir>', 'e2e-playwright-tests/'), // E2E tests, handled by another configuration
    path.join('<rootDir>', 'src/ambire-common/'), // Tests for the ambire-common library, handled by another configuration
    path.join('<rootDir>', 'node_modules/'),
    // Mobile builds
    path.join('<rootDir>', 'android/'),
    path.join('<rootDir>', 'ios/'),
    // Extension, benzin and legends builds
    path.join('<rootDir>', 'build/'),
    // Safari extension xcode project
    path.join('<rootDir>', 'safari-extension/'),
    // Misc
    path.join('<rootDir>', '\\.[^/]+'), // Matches any directory starting with a dot
    path.join('<rootDir>', 'recorder/'), // E2E tests video recorder files
    path.join('<rootDir>', 'vendor/'), // Ruby
    // Stub modules the mapper below points at, not tests
    path.join('<rootDir>', 'src/web/modules/social-recovery/__tests__/stubs/')
  ],
  // One ts-jest rule for .ts and .tsx compiles JSX with the React runtime, so a test can mount a view
  transform: {
    ...baseConfig.transform,
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }]
  },
  setupFiles: [],
  moduleNameMapper: {
    // Modules a mounted view reaches that Jest cannot load. They come before the
    // path aliases, since Jest takes the first pattern that matches.
    '^@common/config/env$': '<rootDir>/src/web/modules/social-recovery/__tests__/stubs/env.ts',
    '^@expo-google-fonts/.+$':
      '<rootDir>/src/web/modules/social-recovery/__tests__/stubs/expoGoogleFonts.ts',
    '^react-native-safe-area-context$':
      '<rootDir>/src/web/modules/social-recovery/__tests__/stubs/safeAreaContext.ts',
    '^react-native-svg$': 'react-native-svg/lib/commonjs/ReactNativeSVG.web.js',
    '^nanoid$': '<rootDir>/src/web/modules/social-recovery/__tests__/stubs/nanoid.ts',
    // The path aliases of tsconfig.json, so a unit test imports like the code it tests
    '^@ambire-common/(.*)$': '<rootDir>/src/ambire-common/src/$1',
    '^@contracts/(.*)$': '<rootDir>/src/ambire-common/contracts/$1',
    '^@ambire-common-v1/(.*)$': '<rootDir>/src/ambire-common/v1/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@mobile/(.*)$': '<rootDir>/src/mobile/$1',
    '^@web/(.*)$': '<rootDir>/src/web/$1',
    '^@benzin/(.*)$': '<rootDir>/src/benzin/$1',
    '^@legends/(.*)$': '<rootDir>/src/legends/$1',
    // The web build renders react-native through react-native-web
    '^react-native$': 'react-native-web'
  }
}
