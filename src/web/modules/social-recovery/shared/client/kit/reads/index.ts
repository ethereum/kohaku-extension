/**
 * The typed views of the deployed contracts over the provider adapter: the
 * manager's, the action's, the method modules' and the Ambire account's.
 */
export { createManagerReads } from './manager'
export { createActionReads } from './action'
export { createMethodReads } from './method'
export { createAccountReads } from './account'
export {
  METHOD_INTERFACE_ID,
  ACTION_INTERFACE_ID,
  MANAGER_INTERFACE_ID,
  VERIFY_MAGIC_VALUE
} from './interface-ids'
export type {
  AccountReads,
  ActionReads,
  ActionReadsChain,
  ManagerReads,
  MethodReads
} from './types'
