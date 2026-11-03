/**
 * The deployment a record was read under, and whether a record counts for the
 * deployment a client reads now: a setup nonce read from one manager says
 * nothing about another's.
 */
import { isAddressEqual } from 'viem'

import type { DeploymentDescriptor } from '@kohaku-eth/social-recovery'

import { isStoredAddress } from './guards'
import { ABSENT } from './types'
import type { CountdownRead, RecordDeployment, RecoverySessionRecord } from './types'

/** The deployment fields a record read through a client of this descriptor carries. */
export const recordDeploymentOf = ({
  manager,
  action
}: Pick<DeploymentDescriptor, 'manager' | 'action'>): RecordDeployment => ({ manager, action })

/**
 * The deployment fields of a stored value, or undefined where the value is not
 * a manager and an action address: a storage read is a boundary.
 */
export const recordDeploymentFrom = (value: unknown): RecordDeployment | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const { manager, action } = value as Record<string, unknown>
  return isStoredAddress(manager) && isStoredAddress(action) ? { manager, action } : undefined
}

/**
 * Whether a record was read under the descriptor's manager and action. A
 * record that names no deployment, one an earlier build wrote, was not.
 */
export const isOfDeployment = (
  deployment: RecordDeployment | undefined,
  descriptor: Pick<DeploymentDescriptor, 'manager' | 'action'>
): boolean =>
  deployment !== undefined &&
  isAddressEqual(deployment.manager, descriptor.manager) &&
  isAddressEqual(deployment.action, descriptor.action)

/**
 * Whether a recovery session runs on the descriptor's manager and action: the
 * ones its live request names, or those a wiped or landed session kept. A
 * wiped or landed session that names none, one an earlier build wrote, does
 * not; a live session whose request names none is left to the checks of its
 * request.
 */
export const isSessionOfDeployment = (
  session: RecoverySessionRecord,
  descriptor: Pick<DeploymentDescriptor, 'manager' | 'action'>
): boolean => {
  if (session.state !== 'live') {
    return isOfDeployment(session.deployment, descriptor)
  }
  const named = recordDeploymentFrom(session.gathering.request)
  return named === undefined || isOfDeployment(named, descriptor)
}

/**
 * A countdown read as one of the descriptor's deployment: a countdown of
 * another deployment, or one that names none, reads absent, so no screen shows
 * or resumes it as a recovery of this build.
 */
export const countdownOfDeployment = (
  read: CountdownRead,
  descriptor: Pick<DeploymentDescriptor, 'manager' | 'action'>
): CountdownRead =>
  read.status === 'present' && !isOfDeployment(read.value.deployment, descriptor) ? ABSENT : read
