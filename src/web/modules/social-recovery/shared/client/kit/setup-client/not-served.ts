/**
 * The members the deployed kit's client does not serve yet: the recovery
 * side's events feed, the setup's clear and events feed, and the verify of
 * a pasted reply. Each refuses with a `NotServedRefusal`
 * naming the member, and none falls back to the scripted stand-in.
 */
import type { IEventManager } from '@web/modules/social-recovery/sdk-interfaces'

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
