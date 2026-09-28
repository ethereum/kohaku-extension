/**
 * The UI's own port to the request queue, for `createSignerFacade`: the
 * dispatch and the window id of `useBackgroundService`, the `signMessage` and
 * `requests` controller states the background pushes over the event bus, and
 * the accounts the wallet lists (`useAccountsControllerState().accounts`).
 */
import eventBus from '@web/extension-services/event/eventBus'

import type {
  ListedAccount,
  RequestsState,
  SignMessageState,
  SignRequestAction,
  SignRequestPort
} from './types'

export const signRequestPort = (
  dispatch: (action: SignRequestAction) => void,
  accounts: () => readonly ListedAccount[] | undefined,
  windowId?: number
): SignRequestPort => ({
  dispatch,
  subscribe(listener) {
    const onSignMessage = (state?: SignMessageState) =>
      listener({ controller: 'signMessage', state: state ?? {} })
    const onRequests = (state?: RequestsState) =>
      listener({ controller: 'requests', state: state ?? {} })
    eventBus.addEventListener('signMessage', onSignMessage)
    eventBus.addEventListener('requests', onRequests)
    return () => {
      eventBus.removeEventListener('signMessage', onSignMessage)
      eventBus.removeEventListener('requests', onRequests)
    }
  },
  accounts: () => accounts() ?? [],
  windowId: () => windowId
})
