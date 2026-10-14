/**
 * The refusal of a member the deployed kit's client does not serve yet: the
 * setup's clear and the events feed's method filter. It names the member,
 * and no such member falls back to the scripted stand-in.
 */
import type { NotServedRefusal } from '../../types'

export const notServedRefusal = (member: string): NotServedRefusal => {
  const error = new Error(
    `The recovery kit on this chain does not serve ${member} yet.`
  ) as NotServedRefusal
  error.name = 'NotServedRefusal'
  error.member = member
  return error
}
