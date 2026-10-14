import React from 'react'
import { Route, Routes } from 'react-router-dom'

import AuthenticatedRoute from '@web/modules/router/components/AuthenticatedRoute'
import KeystoreUnlockedRoute from '@web/modules/router/components/KeystoreUnlockedRoute'
import ArmScreen from '@web/modules/social-recovery/setup/arm/ArmScreen'
import EnrollScreen from '@web/modules/social-recovery/setup/enroll/EnrollScreen'
import ReviewScreen from '@web/modules/social-recovery/setup/review/ReviewScreen'
import RecoveryCardScreen from '@web/modules/social-recovery/setup/card/RecoveryCardScreen'
import PrivacyScreen from '@web/modules/social-recovery/setup/privacy/PrivacyScreen'
import WaitingPeriodScreen from '@web/modules/social-recovery/setup/privacy/WaitingPeriodScreen'
import EditorScreen from '@web/modules/social-recovery/setup/editor/EditorScreen'
import PresetsScreen from '@web/modules/social-recovery/setup/presets/PresetsScreen'
import CeremonyScreen from '@web/modules/social-recovery/shared/ceremony/screen'
import RecoverScreen from '@web/modules/social-recovery/onboarding/recover/RecoverScreen'
import ChecklistScreen from '@web/modules/social-recovery/recovery/checklist/ChecklistScreen'
import InProgressScreen from '@web/modules/social-recovery/recovery/checklist/InProgressScreen'
import SubmitScreen from '@web/modules/social-recovery/recovery/submit/SubmitScreen'
import WaitScreen from '@web/modules/social-recovery/recovery/wait/WaitScreen'
import DoneScreen from '@web/modules/social-recovery/recovery/done/DoneScreen'
import FastTrackScreen from '@web/modules/social-recovery/onboarding/fast-track/FastTrackScreen'
import KeyStepScreen from '@web/modules/social-recovery/onboarding/fast-track/KeyStepScreen'
import GasStepScreen from '@web/modules/social-recovery/onboarding/fast-track/GasStepScreen'
import EntryScreen from '@web/modules/social-recovery/recovery/entry/EntryScreen'
import AccountStepScreen from '@web/modules/social-recovery/recovery/entry/AccountStepScreen'
import ReadoutScreen from '@web/modules/social-recovery/recovery/entry/ReadoutScreen'

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
        <Route path="setup/enroll" element={<EnrollScreen />} />
        <Route path="setup/review" element={<ReviewScreen />} />
        <Route path="setup/card" element={<RecoveryCardScreen />} />
        <Route path="setup/waiting-period" element={<WaitingPeriodScreen />} />
        <Route path="setup/privacy" element={<PrivacyScreen />} />
        <Route path="setup" element={<PresetsScreen />} />
        <Route path="setup/editor" element={<EditorScreen />} />
        <Route path="setup/save" element={<ArmScreen />} />
        <Route path="recovery/checklist" element={<ChecklistScreen />} />
        <Route path="recovery/in-progress" element={<InProgressScreen />} />
        <Route path="recovery/submit" element={<SubmitScreen />} />
        <Route path="recovery/wait" element={<WaitScreen />} />
        <Route path="recovery/done" element={<DoneScreen />} />
        <Route path="fast-track/gas" element={<GasStepScreen />} />
        <Route path="recovery" element={<EntryScreen />} />
        <Route path="recovery/account" element={<AccountStepScreen />} />
        <Route path="recovery/readout" element={<ReadoutScreen />} />
      </Route>
    </Route>

    {/* The open surfaces: no guard, since the guardian page and the fast track run without a keystore. */}
    <Route>
      {/*
        The open surfaces mount here: socialRecoveryApprove,
        socialRecoveryFastTrack and socialRecoveryRecover.
      */}
      {/* The passkey ceremony tab. It needs no guard, because a fresh install with no keystore also opens it. */}
      <Route path="ceremony" element={<CeremonyScreen />} />
      <Route path="recover" element={<RecoverScreen />} />
      <Route path="fast-track" element={<FastTrackScreen />} />
      <Route path="fast-track/key" element={<KeyStepScreen />} />
    </Route>
  </Routes>
)

export default SocialRecoveryRoutes
