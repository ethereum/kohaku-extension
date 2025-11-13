import { nanoid } from 'nanoid'

import { NotificationManager } from '@ambire-common/interfaces/notification'
import { browser, isSafari } from '@web/constants/browserapi'

export const notificationManager: NotificationManager = {
  create: async ({ title, message, icon }: { title: string; message: string; icon?: string }) => {
    try {
      if (isSafari()) return
      // Await here to ensure notifications work correctly in a service_worker (MV3)
      await browser.notifications.create(nanoid(), {
        type: 'basic',
        iconUrl: icon || browser.runtime.getURL('assets/images/xicon_kohaku@96.png'),
        title,
        message
      })
    } catch (err) {
      console.warn(`Failed to register browser notification: ${err}`)
    }
  }
}
