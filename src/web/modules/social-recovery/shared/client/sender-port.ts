/**
 * The UI's own port to the request queue and the activity, for
 * `createSendPort`: the dispatch and the window id of `useBackgroundService`,
 * the `requests`, `activity` and `main` controller states the background
 * pushes over the event bus, and the accounts the wallet lists
 * (`useAccountsControllerState().accounts`).
 */
import eventBus from '@web/extension-services/event/eventBus'

import type {
  ActivityState,
  ListedAccount,
  MainStatusState,
  SendQueueState,
  SendRequestAction,
  SendRequestPort
} from './types'

export const sendRequestPort = (
  dispatch: (action: SendRequestAction) => void,
  accounts: () => readonly ListedAccount[] | undefined,
  windowId?: number
): SendRequestPort => ({
  dispatch,
  subscribe(listener) {
    const onRequests = (state?: SendQueueState) =>
      listener({ controller: 'requests', state: state ?? {} })
    const onActivity = (state?: ActivityState) =>
      listener({ controller: 'activity', state: state ?? {} })
    const onMain = (state?: MainStatusState) => listener({ controller: 'main', state: state ?? {} })
    eventBus.addEventListener('requests', onRequests)
    eventBus.addEventListener('activity', onActivity)
    eventBus.addEventListener('main', onMain)
    return () => {
      eventBus.removeEventListener('requests', onRequests)
      eventBus.removeEventListener('activity', onActivity)
      eventBus.removeEventListener('main', onMain)
    }
  },
  accounts: () => accounts() ?? [],
  windowId: () => windowId
})
