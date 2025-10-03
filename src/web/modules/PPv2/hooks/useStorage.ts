import { useCallback } from 'react'

import { encrypt, decrypt } from '@web/modules/PPv2/utils/encryption'
import { storeData, getData } from '@web/modules/PPv2/utils/extensionStorage'

// TODO: use user's password
export const useStorage = ({ password }: { password: string } = { password: '12345678' }) => {
  const encryptData = useCallback(
    async (data: string) => {
      return encrypt(data, password)
    },
    [password]
  )

  const decryptData = useCallback(
    async (encryptedData: string) => {
      return decrypt(encryptedData, password)
    },
    [password]
  )

  return {
    storeData,
    getData,
    encrypt: encryptData,
    decrypt: decryptData
  }
}
