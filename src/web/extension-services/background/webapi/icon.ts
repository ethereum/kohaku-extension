import { isDev } from '@common/config/env'
import { browser } from '@web/constants/browserapi'

export const setExtensionIcon = (type: 'default' | 'locked') => {
  const icons = [16, 48, 96, 128].reduce((res: { [key: number]: string }, size: number) => {
    const fileNameSuffix = `${size}${isDev ? '-dev-build-ONLY' : ''}`
    if (type === 'locked') {
      res[size] = `assets/images/xicon_kohaku_locked@${fileNameSuffix}.png`
    } else {
      res[size] = `assets/images/xicon_kohaku@${fileNameSuffix}.png`
    }

    return res
  }, {})

  return browser.action.setIcon({ path: icons })
}
