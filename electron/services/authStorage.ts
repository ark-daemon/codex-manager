/**
 * authStorage.ts
 *
 * Wraps Electron's safeStorage API to encrypt/decrypt auth.json files at rest.
 *
 * On-disk formats (encrypted):
 *   "CMENC1:" + safeStorage buffer   -> OS keychain sealed (preferred)
 *   "CMPWD1:" + cryptoBox envelope   -> session-passphrase sealed (fallback
 *                                       when no OS keychain is available)
 *
 * SECURITY (Blocker 2): auth.json is NEVER written as plaintext. If neither the
 * OS keychain nor a session passphrase is available, writeAuthFile throws
 * PassphraseRequiredError so the caller can prompt the user to unlock. This
 * replaces the previous silent plain-UTF-8 fallback.
 */

import fs from "node:fs/promises";
import path from "node:path";
import electron from "electron";
import {
  CMPWD_MAGIC,
  PassphraseRequiredError,
  hasSessionPassphrase,
  isPassphraseSealed,
  openWithSession,
  sealWithSession
} from "./sessionKey.js";

const { safeStorage } = electron;

/** Magic prefix that marks an on-disk file as keychain-encrypted by this module. */
const MAGIC = Buffer.from("CMENC1:", "ascii");

export { PassphraseRequiredError } from "./sessionKey.js";

/**
 * Returns true when OS-level encryption is available.
 * This wraps `safeStorage.isEncryptionAvailable()` and is safe to call
 * from any point after the `app.whenReady()` promise resolves.
 */
export function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

/**
 * True when we can seal a file by SOME means: OS keychain or a session
 * passphrase. When this is false, writes must not proceed (would be plaintext).
 */
export function isSealingAvailable(): boolean {
  return isEncryptionAvailable() || hasSessionPassphrase();
}

export interface ReadAuthFileOptions {
  /**
   * When true, skips the automatic plain-text \u2192 encrypted migration that
   * normally happens on read. Use this when the file must remain plain text
   * for another application to read (e.g. Codex's live auth.json).
   */
  skipAutoEncrypt?: boolean;
}

/**
 * Read an auth.json-shaped file and return its text content.
 * Transparently decrypts files written by writeAuthFile() (CMENC1 keychain or
 * CMPWD1 passphrase). Returns undefined if the file does not exist, cannot be
 * decrypted with available key material, or cannot be parsed.
 */
export async function readAuthFile(filePath: string, options?: ReadAuthFileOptions): Promise<string | undefined> {
  let raw: Buffer;
  try {
    raw = await fs.readFile(filePath);
  } catch {
    return undefined;
  }

  // Passphrase-sealed (CMPWD1) \u2014 needs the session passphrase.
  if (isPassphraseSealed(raw)) {
    if (!hasSessionPassphrase()) {
      console.warn(`[authStorage] passphrase not set \u2014 cannot decrypt ${filePath}`);
      return undefined;
    }
    try {
      return await openWithSession(raw);
    } catch (err) {
      console.error(`[authStorage] passphrase decryption failed for ${filePath}:`, err);
      return undefined;
    }
  }

  // Keychain-sealed (CMENC1).
  if (raw.length > MAGIC.length && raw.slice(0, MAGIC.length).equals(MAGIC)) {
    if (!isEncryptionAvailable()) {
      console.warn(`[authStorage] safeStorage unavailable \u2014 cannot decrypt ${filePath}`);
      return undefined;
    }
    try {
      const encrypted = raw.slice(MAGIC.length);
      return safeStorage.decryptString(encrypted);
    } catch (err) {
      console.error(`[authStorage] decryption failed for ${filePath}:`, err);
      const fallback = raw.toString("utf8");
      return looksLikeJson(fallback) ? fallback : undefined;
    }
  }

  // Some old encrypted files may not have our magic prefix. Try decryption
  // first, but only accept it if it produces valid auth JSON.
  if (isEncryptionAvailable()) {
    try {
      const decrypted = safeStorage.decryptString(raw);
      if (looksLikeJson(decrypted)) {
        return decrypted;
      }
    } catch {
      // Legacy plain-text auth.json files are expected to fail decryption.
    }
  }

  // Plain text (legacy or written before sealing was available). Migrate valid
  // JSON immediately on first read so existing profiles become protected.
  const text = raw.toString("utf8");
  if (!options?.skipAutoEncrypt && looksLikeJson(text) && isSealingAvailable()) {
    await writeAuthFile(filePath, text).catch((error: unknown) => {
      console.warn(`[authStorage] could not migrate plain-text auth.json on read: ${filePath}`, error);
    });
  }
  return text;
}

export interface AuthReadDiagnostics {
  /** Absolute path that was read. */
  path: string;
  /** Whether the file existed on disk at all. */
  exists: boolean;
  /**
   * How the file was decoded:
   * "encrypted-ok"            \u2013 CMENC1 magic found, safeStorage decryption succeeded
   * "encrypted-failed"        \u2013 CMENC1 magic found, decryption threw (key mismatch?)
   * "encrypted-unavailable"   \u2013 CMENC1 magic found but safeStorage is not available
   * "passphrase-ok"           \u2013 CMPWD1 magic found, passphrase decryption succeeded
   * "passphrase-failed"       \u2013 CMPWD1 magic found, passphrase wrong / tampered
   * "passphrase-unavailable"  \u2013 CMPWD1 magic found but no session passphrase set
   * "legacy-decrypted"        \u2013 no magic prefix but blind safeStorage decrypt yielded valid JSON
   * "plain-text"              \u2013 read as UTF-8 JSON (unencrypted)
   * "unreadable"              \u2013 file exists but content is not usable JSON
   * "missing"                 \u2013 file did not exist
   */
  decryptionOutcome:
    | "encrypted-ok"
    | "encrypted-failed"
    | "encrypted-unavailable"
    | "passphrase-ok"
    | "passphrase-failed"
    | "passphrase-unavailable"
    | "legacy-decrypted"
    | "plain-text"
    | "unreadable"
    | "missing";
  /** Error message if decryption threw. */
  decryptionError?: string;
  /** The decoded text (undefined when not usable). */
  text: string | undefined;
}

/**
 * Same as readAuthFile() but returns structured diagnostics alongside the
 * decoded text. Use this when you need to surface "why did this fail" detail
 * in log output.
 */
export async function readAuthFileWithDiagnostics(filePath: string, options?: ReadAuthFileOptions): Promise<AuthReadDiagnostics> {
  let raw: Buffer;
  try {
    raw = await fs.readFile(filePath);
  } catch {
    return { path: filePath, exists: false, decryptionOutcome: "missing", text: undefined };
  }

  const base: Pick<AuthReadDiagnostics, "path" | "exists"> = { path: filePath, exists: true };

  // --- CMPWD1 passphrase-sealed ---
  if (isPassphraseSealed(raw)) {
    if (!hasSessionPassphrase()) {
      return { ...base, decryptionOutcome: "passphrase-unavailable", text: undefined };
    }
    try {
      const text = await openWithSession(raw);
      return { ...base, decryptionOutcome: "passphrase-ok", text };
    } catch (err) {
      const decryptionError = err instanceof Error ? err.message : String(err);
      return { ...base, decryptionOutcome: "passphrase-failed", decryptionError, text: undefined };
    }
  }

  // --- CMENC1 keychain-encrypted ---
  if (raw.length > MAGIC.length && raw.slice(0, MAGIC.length).equals(MAGIC)) {
    if (!isEncryptionAvailable()) {
      return { ...base, decryptionOutcome: "encrypted-unavailable", text: undefined };
    }
    try {
      const text = safeStorage.decryptString(raw.slice(MAGIC.length));
      return { ...base, decryptionOutcome: "encrypted-ok", text };
    } catch (err) {
      const decryptionError = err instanceof Error ? err.message : String(err);
      const fallback = raw.toString("utf8");
      const text = looksLikeJson(fallback) ? fallback : undefined;
      return { ...base, decryptionOutcome: "encrypted-failed", decryptionError, text };
    }
  }

  // --- Legacy: try blind safeStorage decrypt ---
  if (isEncryptionAvailable()) {
    try {
      const decrypted = safeStorage.decryptString(raw);
      if (looksLikeJson(decrypted)) {
        return { ...base, decryptionOutcome: "legacy-decrypted", text: decrypted };
      }
    } catch {
      // Not a legacy-encrypted file \u2014 fall through to plain text.
    }
  }

  // --- Plain text ---
  const text = raw.toString("utf8");
  if (looksLikeJson(text)) {
    if (!options?.skipAutoEncrypt && isSealingAvailable()) {
      // Opportunistically migrate to sealed storage.
      await writeAuthFile(filePath, text).catch((error: unknown) => {
        console.warn(`[authStorage] could not migrate plain-text auth.json on read: ${filePath}`, error);
      });
    }
    return { ...base, decryptionOutcome: "plain-text", text };
  }

  return { ...base, decryptionOutcome: "unreadable", text: undefined };
}

/**
 * Encrypt `content` and write to `filePath`.
 * Prefers the OS keychain (CMENC1); falls back to session-passphrase sealing
 * (CMPWD1) when no keychain is available. Throws PassphraseRequiredError when
 * neither is available \u2014 auth.json is NEVER written as plaintext.
 * Returns whether OS-keychain encryption was used.
 */
export async function writeAuthFile(filePath: string, content: string): Promise<boolean> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  if (isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(content);
    const payload = Buffer.concat([MAGIC, encrypted]);
    await fs.writeFile(filePath, payload);
    return true;
  }

  // No OS keychain \u2014 seal with the session passphrase instead of plaintext.
  if (hasSessionPassphrase()) {
    const payload = await sealWithSession(content);
    await fs.writeFile(filePath, payload);
    return false;
  }

  // Neither keychain nor passphrase: refuse. Caller should prompt to unlock.
  throw new PassphraseRequiredError(
    "Cannot store credentials securely: no OS keychain is available and no session passphrase has been set. " +
    "Unlock Relay with a passphrase to continue."
  );
}

/**
 * Migrate a single auth.json path in-place: if it is currently plain text,
 * re-seal it using writeAuthFile (keychain or passphrase).
 *
 * Safe to call concurrently on different paths.
 * Returns "encrypted" | "skipped" | "unavailable" | "missing".
 * ("encrypted" covers both keychain and passphrase sealing.)
 */
export async function migrateAuthFile(filePath: string): Promise<"encrypted" | "skipped" | "unavailable" | "missing"> {
  if (!isSealingAvailable()) {
    return "unavailable";
  }

  let raw: Buffer;
  try {
    raw = await fs.readFile(filePath);
  } catch {
    return "missing";
  }

  // Already sealed (either scheme) \u2014 nothing to do.
  if (isPassphraseSealed(raw)) {
    return "skipped";
  }
  if (raw.length > MAGIC.length && raw.slice(0, MAGIC.length).equals(MAGIC)) {
    return "skipped";
  }

  // Plain text \u2014 re-seal in place.
  const text = raw.toString("utf8");
  await writeAuthFile(filePath, text);
  return "encrypted";
}

function looksLikeJson(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Boolean(parsed && typeof parsed === "object");
  } catch {
    return false;
  }
}
