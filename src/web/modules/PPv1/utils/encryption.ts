import aes from 'aes-js'
import { concat, getBytes, hexlify, keccak256, toUtf8Bytes } from 'ethers'

import { EntropyGenerator } from '@ambire-common/libs/entropyGenerator/entropyGenerator'
import { ScryptAdapter } from '@ambire-common/libs/scrypt/scryptAdapter'

// Using a lower N to speed up the encryption/decryption process
const scryptDefaults = { N: 16384, r: 8, p: 1, dkLen: 64 }
const CIPHER = 'aes-128-ctr'

function getBytesForSecret(secret: string) {
  // see https://github.com/ethers-io/ethers.js/blob/v5/packages/json-wallets/src.ts/utils.ts#L19-L24
  return toUtf8Bytes(secret, 'NFKC')
}

const entropyGenerator = new EntropyGenerator()
const scryptAdapter = new ScryptAdapter('default')

export const encrypt = async (data: string, password: string) => {
  const salt = entropyGenerator.generateRandomBytes(32, '')
  const key = await scryptAdapter.scrypt(getBytesForSecret(password), salt, {
    N: scryptDefaults.N,
    r: scryptDefaults.r,
    p: scryptDefaults.p,
    dkLen: scryptDefaults.dkLen
  })

  const iv = entropyGenerator.generateRandomBytes(16, '')
  const derivedKey = key.slice(0, 16)
  const macPrefix = key.slice(16, 32)
  const counter = new aes.Counter(iv)
  // eslint-disable-next-line new-cap
  const aesCtr = new aes.ModeOfOperation.ctr(derivedKey, counter)
  const ciphertext = aesCtr.encrypt(new TextEncoder().encode(data))
  const mac = keccak256(concat([macPrefix, ciphertext]))

  const encrypted = {
    cipherType: CIPHER,
    ciphertext: hexlify(ciphertext),
    iv: hexlify(iv),
    mac: hexlify(mac),
    salt: hexlify(salt),
    scryptParams: { salt: hexlify(salt), ...scryptDefaults }
  }

  return JSON.stringify(encrypted)
}

export const decrypt = async (encryptedData: string, password: string) => {
  try {
    const parsed = JSON.parse(encryptedData)
    const { scryptParams, ciphertext, iv, mac } = parsed

    if (parsed.cipherType !== CIPHER) {
      throw new Error(`Unsupported cipherType ${parsed.cipherType}`)
    }

    const key = await scryptAdapter.scrypt(
      getBytesForSecret(password),
      getBytes(scryptParams.salt),
      {
        N: scryptParams.N,
        r: scryptParams.r,
        p: scryptParams.p,
        dkLen: scryptParams.dkLen
      }
    )

    const ivBytes = getBytes(iv)
    const derivedKey = key.slice(0, 16)
    const macPrefix = key.slice(16, 32)
    const counter = new aes.Counter(ivBytes)
    // eslint-disable-next-line new-cap
    const aesCtr = new aes.ModeOfOperation.ctr(derivedKey, counter)
    const calculatedMac = keccak256(concat([macPrefix, ciphertext]))

    if (calculatedMac !== mac) {
      throw new Error('MAC verification failed - data may be corrupted or tampered with')
    }

    const decrypted = aesCtr.decrypt(getBytes(ciphertext))
    return new TextDecoder().decode(decrypted)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Decrypt - Error:', error)
    throw error
  }
}
