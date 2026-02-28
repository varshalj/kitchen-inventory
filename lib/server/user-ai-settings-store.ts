import { createMaskedFingerprint, encryptApiKey, type EncryptedBlob } from "@/lib/server/ai-key-crypto"

export type KeyStatus = "active" | "revoked"

export type AuditAction = "validated" | "rotated" | "revoked"

export type UserAiKeyVersion = {
  version: number
  provider: "openai"
  model: string
  status: KeyStatus
  keyMetadata: {
    maskedKey: string
    fingerprint: string
  }
  encryptedBlob: EncryptedBlob
  createdAt: string
  revokedAt?: string
}

export type UserAiAuditEvent = {
  action: AuditAction
  version: number
  createdAt: string
  actor: string
  details: string
}

export type UserAiSettingsRecord = {
  userId: string
  activeVersion: number | null
  keyVersions: UserAiKeyVersion[]
  auditTrail: UserAiAuditEvent[]
}

type Store = Map<string, UserAiSettingsRecord>

const globalStore = globalThis as typeof globalThis & { __userAiSettingsStore?: Store }

function getStore(): Store {
  if (!globalStore.__userAiSettingsStore) {
    globalStore.__userAiSettingsStore = new Map<string, UserAiSettingsRecord>()
  }

  return globalStore.__userAiSettingsStore
}

export function getOrCreateUserAiSettings(userId: string): UserAiSettingsRecord {
  const store = getStore()
  const existing = store.get(userId)
  if (existing) return existing

  const created: UserAiSettingsRecord = {
    userId,
    activeVersion: null,
    keyVersions: [],
    auditTrail: [],
  }
  store.set(userId, created)
  return created
}

export function createValidatedSnapshot(apiKey: string) {
  return createMaskedFingerprint(apiKey)
}

export function rotateUserKey({
  userId,
  actor,
  apiKey,
  model,
}: {
  userId: string
  actor: string
  apiKey: string
  model: string
}) {
  const record = getOrCreateUserAiSettings(userId)
  const timestamp = new Date().toISOString()

  record.keyVersions.forEach((version) => {
    if (version.status === "active") {
      version.status = "revoked"
      version.revokedAt = timestamp
    }
  })

  const nextVersion = (record.keyVersions.at(-1)?.version ?? 0) + 1
  const keyMetadata = createMaskedFingerprint(apiKey)

  const version: UserAiKeyVersion = {
    version: nextVersion,
    provider: "openai",
    model,
    status: "active",
    keyMetadata,
    encryptedBlob: encryptApiKey(apiKey),
    createdAt: timestamp,
  }

  record.keyVersions.push(version)
  record.activeVersion = version.version
  record.auditTrail.unshift({
    action: "rotated",
    version: version.version,
    createdAt: timestamp,
    actor,
    details: `Activated version ${version.version} for model ${model}`,
  })

  return version
}

export function revokeActiveUserKey({ userId, actor }: { userId: string; actor: string }) {
  const record = getOrCreateUserAiSettings(userId)
  const active = record.keyVersions.find((item) => item.version === record.activeVersion && item.status === "active")

  if (!active) {
    return null
  }

  const timestamp = new Date().toISOString()
  active.status = "revoked"
  active.revokedAt = timestamp
  record.activeVersion = null
  record.auditTrail.unshift({
    action: "revoked",
    version: active.version,
    createdAt: timestamp,
    actor,
    details: `Revoked version ${active.version}`,
  })

  return active
}

export function addValidationAudit({ userId, actor, version, model }: { userId: string; actor: string; version: number; model: string }) {
  const record = getOrCreateUserAiSettings(userId)
  record.auditTrail.unshift({
    action: "validated",
    version,
    createdAt: new Date().toISOString(),
    actor,
    details: `Validated credentials for model ${model}`,
  })
}
