import React from 'react'
import { Route, Routes } from 'react-router-dom'

import AuthenticatedRoute from '@web/modules/router/components/AuthenticatedRoute'
import KeystoreUnlockedRoute from '@web/modules/router/components/KeystoreUnlockedRoute'

/**
 * The route registry of the account recovery module.
 *
 * MainRoutes mounts this element once at `social-recovery/*` inside its
 * TabOnlyRoute group, so every recovery surface opens in a full tab and this
 * file owns the guards. The paths below are relative to that mount: a screen's
 * path is its WEB_ROUTES value without the `social-recovery/` prefix, for
 * example `setup` for WEB_ROUTES.socialRecoverySetup.
 *
 * A task adds exactly one <Route> line for its screen inside the group its
 * surface belongs to, and nothing else in this file.
 */
const SocialRecoveryRoutes = () => (
  <Routes>
    {/*
      The bare module path renders nothing until a task mounts a landing screen.
      React Router 6.8 matches a layout group only through a leaf, so without
      this index route `social-recovery` itself matches no route at all.
    */}
    <Route index element={null} />

    {/* The owner's surfaces: the keystore is unlocked and an account exists. */}
    <Route element={<KeystoreUnlockedRoute />}>
      <Route element={<AuthenticatedRoute />}>
        {/*
          The owner's surfaces mount here: socialRecoverySetup,
          socialRecoveryManage, socialRecoveryCancel, socialRecoveryCreate and
          socialRecoveryRecovery.
        */}
      </Route>
    </Route>

    {/* The open surfaces: no guard, since the guardian page and the fast track run without a keystore. */}
    <Route>
      {/*
        The open surfaces mount here: socialRecoveryApprove,
        socialRecoveryFastTrack and socialRecoveryRecover. socialRecoveryCeremony
        mounts in the group its callers need.
      */}
    </Route>
  </Routes>
)

export default SocialRecoveryRoutes
