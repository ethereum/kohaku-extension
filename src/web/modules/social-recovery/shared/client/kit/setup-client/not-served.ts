/**
 * The members the deployed kit's client does not serve yet: the recovery
 * side, the setup's clear, the events feed and the verify of a pasted reply.
 * Each refuses with a `NotServedRefusal` naming the member, and none falls
 * back to the scripted stand-in.
 */
import type { IEventManager, IRecoveryClient } from '@web/modules/social-recovery/sdk-interfaces'

import type { NotServedRefusal } from '../../types'

export const notServedRefusal = (member: string): NotServedRefusal => {
  const error = new Error(
    `The recovery kit on this chain does not serve ${member} yet.`
  ) as NotServedRefusal
  error.name = 'NotServedRefusal'
  error.member = member
  return error
}

const refuse = (member: string) => (): never => {
  throw notServedRefusal(member)
}

const reject = (member: string) => (): Promise<never> => Promise.reject(notServedRefusal(member))

/** The events feed of one part, every member refused. */
export const notServedEvents = (part: string): IEventManager => ({
  accountFilter: refuse(`${part}.events.accountFilter`),
  methodFilter: refuse(`${part}.events.methodFilter`),
  privilegeFilter: refuse(`${part}.events.privilegeFilter`),
  fetch: reject(`${part}.events.fetch`),
  decodeLog: refuse(`${part}.events.decodeLog`)
})

/** The recovery client, every member refused. */
export const notServedRecoveryClient = (): IRecoveryClient => ({
  initRecoveryGathering: reject('recovery.initRecoveryGathering'),
  initCancelGathering: reject('recovery.initCancelGathering'),
  getApproverRequests: refuse('recovery.getApproverRequests'),
  addApproverReply: refuse('recovery.addApproverReply'),
  assess: refuse('recovery.assess'),
  complete: refuse('recovery.complete'),
  prepareStartAttempt: reject('recovery.prepareStartAttempt'),
  prepareCancelByProofs: reject('recovery.prepareCancelByProofs'),
  prepareCancelByOwner: reject('recovery.prepareCancelByOwner'),
  prepareCancelByVeto: reject('recovery.prepareCancelByVeto'),
  prepareExecuteHandover: reject('recovery.prepareExecuteHandover'),
  recoveryState: reject('recovery.recoveryState'),
  events: notServedEvents('recovery')
})
