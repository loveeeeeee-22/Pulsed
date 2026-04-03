import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function deriveKey() {
  const secret =
    process.env.BROKER_CREDENTIALS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY
  if (!secret || String(secret).length < 8) {
    throw new Error(
      'Set BROKER_CREDENTIALS_ENCRYPTION_KEY or ENCRYPTION_KEY (min 8 characters)'
    )
  }
  return crypto.createHash('sha256').update(String(secret), 'utf8').digest()
}

/**
 * Encrypt a JSON-serializable object. Returns base64(iv + authTag + ciphertext).
 */
export function encryptCredentialsPayload(obj) {
  const key = deriveKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const json = JSON.stringify(obj)
  const enc = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

/**
 * Decrypt payload produced by encryptCredentialsPayload.
 */
export function decryptCredentialsPayload(b64) {
  const key = deriveKey()
  const buf = Buffer.from(String(b64), 'base64')
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Invalid encrypted credentials blob')
  }
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const data = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(dec.toString('utf8'))
}

/**
 * Normalize stored credentials column: supports { encrypted: "<b64>" } or legacy plain object.
 */
export function decryptStoredCredentials(credentials) {
  if (!credentials || typeof credentials !== 'object') {
    throw new Error('Missing credentials')
  }
  if (typeof credentials.encrypted === 'string') {
    return decryptCredentialsPayload(credentials.encrypted)
  }
  if (credentials._legacy_plain === true) {
    return { ...credentials }
  }
  throw new Error('Credentials are not in encrypted format. Re-connect this broker.')
}
