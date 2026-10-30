// Stands in for react-native-safe-area-context: its main entry loads React Native's native specs, which Jest cannot parse.
import type { ChildrenProps } from '@web/modules/social-recovery/__tests__/stubs/types'

const ZERO = { top: 0, right: 0, bottom: 0, left: 0 }

export const useSafeAreaInsets = () => ZERO
export const SafeAreaProvider = ({ children }: ChildrenProps) => children ?? null
