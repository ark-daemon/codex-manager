/**
 * sessionKey.ts
 *
 * Backs Blocker 2: when the OS keychain (Electron safeStorage) is unavailable
 * (headless Linux, no gnome-keyring/kwallet, some VMs), auth.json must still
 * NEVER be written as plaintext. Instead we seal it with a passphrase the user
 * enters once per session, using the same AES-256-GCM/scrypt primitive as
 * encrypted exports (cryptoBox).
 *
 * The passphrase lives only in process memory for the app's lifetime. It is
 * never persisted. If the app restarts, the user unlocks again.
 *
 * On-disk format for passphrase-sealed auth files:
 *   7-byte ASCII magic "CMPWD1:" followed by a UTF-8 JSON cryptoBox envelope.
 * This is distinct from safeStorage's "CMENC1:" prefix so the two schemes never
 * collide and readers can tell which key material a file needs.
 */

import { isSecureEnvelope, openText, RawSecureEnvelope, sealText } from "./cryptoBox.js";

/** Magic prefix marking a passphrase-sealed (not keychain-sealed) auth file. */
export const CMPWD_MAGIC = Buffer.from("CMPWD1:", "ascii");

/** Thrown by seal/open helpers when no session passphrase has been set yet. */
export class PassphraseRequiredError extends Error {
  constructor(message = "A session passphrase is required. Unlock Relay to continue.") {
    super(message);
    this.name = "PassphraseRequiredError";
  }
}

// Module-scoped, in-memory only. Never written to disk, never logged.
let sessionPassphrase: string | undefined;

/** Set the unlock passphrase for this process session. */
export function setSessionPassphrase(passphrase: string): void {
  if (!passphrase || passphrase.length === 0) {
    throw new Error("Passphrase must not be empty.");
  }
  sessionPassphrase = passphrase;
}

/** Clear the in-memory passphrase (e.g. on explicit lock). */
export function clearSessionPassphrase(): void {
  sessionPassphrase = undefined;
}

/** True once the user has provided a passphrase this session. */
export function hasSessionPassphrase(): boolean {
  return Boolean(sessionPassphrase && sessionPassphrase.length > 0);
}

/**
 * Seal a UTF-8 string (an auth.json blob) into a CMPWD1-prefixed Buffer using
 * the current session passphrase. Throws PassphraseRequiredError if unset.
 */
export async function sealWithSession(text: string): Promise<Buffer> {
  const passphrase = sessionPassphrase;
  if (!passphrase) {
    throw new PassphraseRequiredError();
  }
  const envelope = await sealText(text, passphrase);
  const json = Buffer.from(JSON.stringify(envelope), "utf8");
  return Buffer.concat([CMPWD_MAGIC, json]);
}

/** True when a raw file buffer is a CMPWD1 passphrase-sealed auth file. */
export function isPassphraseSealed(raw: Buffer): boolean {
  return raw.length > CMPWD_MAGIC.length && raw.slice(0, CMPWD_MAGIC.length).equals(CMPWD_MAGIC);
}

/**
 * Open a CMPWD1-prefixed Buffer back to its UTF-8 plaintext using the current
 * session passphrase. Throws PassphraseRequiredError if unset, or a friendly
 * error if the passphrase is wrong / the file was tampered with.
 */
export async function openWithSession(raw: Buffer): Promise<string> {
  if (!isPassphraseSealed(raw)) {
    throw new Error("File is not a passphrase-sealed Relay auth file.");
  }
  const passphrase = sessionPassphrase;
  if (!passphrase) {
    throw new PassphraseRequiredError();
  }
  let envelope: RawSecureEnvelope;
  try {
    // SAFETY: parsing session passphrase payload as RawSecureEnvelope
    envelope = JSON.parse(raw.slice(CMPWD_MAGIC.length).toString("utf8")) as RawSecureEnvelope;
  } catch {
    throw new Error("Passphrase-sealed auth file is corrupt.");
  }
  if (!isSecureEnvelope(envelope)) {
    throw new Error("Passphrase-sealed auth file has an invalid envelope.");
  }
  return openText(envelope, passphrase);
}
