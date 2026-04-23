const LEGACY_OWNER_EMAIL = "maahir.engineer@gmail.com";

export function normalizeOwnerEmail(email?: string | null) {
  return String(email || "").trim().toLowerCase();
}

export function accountStorageKey(baseKey: string, email?: string | null) {
  const ownerEmail = normalizeOwnerEmail(email);
  if (!ownerEmail) return `${baseKey}:signed-out`;
  return `${baseKey}:${ownerEmail}`;
}

export function legacyOwnerEmail() {
  return LEGACY_OWNER_EMAIL;
}
