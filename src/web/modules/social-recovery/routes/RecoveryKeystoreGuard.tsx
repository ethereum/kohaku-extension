import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { ROUTES } from '@common/modules/router/constants/common'
import useKeystoreControllerState from '@web/hooks/useKeystoreControllerState'

/**
 * Sends a locked keystore to the unlock screen, which comes back to the same
 * page once unlocked. The path is absolute because this registry is a nested
 * mount: a relative path resolves under `social-recovery/`, where no unlock
 * screen exists.
 */
const RecoveryKeystoreGuard = () => {
  const { isReadyToStoreKeys, isUnlocked } = useKeystoreControllerState()
  const { pathname, search, hash } = useLocation()

  if (isReadyToStoreKeys && !isUnlocked) {
    return (
      <Navigate
        to={`/${ROUTES.keyStoreUnlock}`}
        state={{ returnTo: { pathname, search, hash } }}
        replace
      />
    )
  }

  return <Outlet />
}

export default RecoveryKeystoreGuard
