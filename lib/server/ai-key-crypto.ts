import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

const AES_ALGORITHM = "aes-256-gcm"

export type EncryptedBlob = {
  algorithm: "aes-256-gcm"
  keyVersion: string
  iv: string
  authTag: string
  ciphertext: string
}

function getMasterKey(): Buffer {
  const source = process.env.KMS_MASTER_KEY
  if (!source) {
    throw new Error("KMS_MASTER_KEY is not configured")
  }

  return createHash("sha256").update(source).digest()
}

export function encryptApiKey(plaintext: string): EncryptedBlob {
  const iv = randomBytes(12)
  const key = getMasterKey()
  const cipher = createCipheriv(AES_ALGORITHM, key, iv)

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    algorithm: "aes-256-gcm",
    keyVersion: "kms-master-v1",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  }
}

export function decryptApiKey(blob: EncryptedBlob): string {
  const key = getMasterKey()
  const decipher = createDecipheriv(AES_ALGORITHM, key, Buffer.from(blob.iv, "base64"))
  decipher.setAuthTag(Buffer.from(blob.authTag, "base64"))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}

export function createMaskedFingerprint(apiKey: string): { maskedKey: string; fingerprint: string } {
  // SHA-256 is intentional here. CodeQL's js/insufficient-password-hash flags
  // this because the input is named `apiKey`, but this is NOT password hashing:
  //   - The fingerprint is sliced to 12 hex chars and used purely as a display
  //     identifier so users can tell their keys apart in the UI (no auth).
  //   - Actual key storage uses AES-256-GCM (see encryptApiKey above).
  //   - Pre-image attack on a 12-char prefix of sha256(provider-API-key) is
  //     computationally infeasible.
  // Switching to bcrypt/argon2/scrypt would not improve security for this use.
  const fingerprint = createHash("sha256").update(apiKey).digest("hex")
  const prefix = apiKey.slice(0, 4)
  const suffix = apiKey.slice(-4)
  const maskedKey = `${prefix}${"*".repeat(Math.max(0, apiKey.length - 8))}${suffix}`

  return {
    maskedKey,
    fingerprint: `${fingerprint.slice(0, 12)}...`,
  }
}
