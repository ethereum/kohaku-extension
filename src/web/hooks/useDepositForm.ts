/**
 * Wrapper hook that routes to the appropriate privacy protocol form hook
 * based on the selected provider (Privacy Pools or Railgun).
 *
 * This allows both protocols to maintain independent state and prevents
 * mixing of concerns between different privacy protocols.
 */
import usePrivacyPoolsControllerState from './usePrivacyPoolsControllerState'
import usePrivacyPoolsForm from '@web/modules/PPv1/hooks/usePrivacyPoolsForm'
import useRailgunForm from '@web/modules/railgun/hooks/useRailgunForm'

const useDepositForm = () => {
  // Get the privacy provider setting from Privacy Pools controller
  // (both controllers share this setting)
  const { privacyProvider } = usePrivacyPoolsControllerState()

  // IMPORTANT: Always call both hooks unconditionally to maintain consistent hook order
  // This prevents React's "Hooks called in different order" error
  const privacyPoolsForm = usePrivacyPoolsForm()
  const railgunForm = useRailgunForm()

  // Route to the appropriate hook based on the selected provider
  // Default to privacy-pools if not set
  const activeProvider = privacyProvider || 'privacy-pools'

  if (activeProvider === 'railgun') {
    return railgunForm
  }

  return privacyPoolsForm
}

export default useDepositForm
