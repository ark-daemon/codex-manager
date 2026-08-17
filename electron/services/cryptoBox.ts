/**
 * cryptoBox.ts
 *
 * Self-contained, zero-dependency passphrase crypto built on Node's built-in
 * `crypto` module. Used to seal portable data (export bundles, and the
 * no-keyring auth fallback) with a key derived from a user passphrase.
 *
 * Envelope format (JSON, self-describing so it can be decrypted on any
 * machine without out-of-band parameters):
 *   {
 *     "cmSecure": 1,
 *     "kdf": { "algo": "scrypt", "N": 32768, "r": 8, "p": 1, "salt": <b64> },
 *     "cipher": "aes-256-gcm",
 *     "iv":   <b64>,
 *     "tag":  <b64>,
 *     "data": <b64>
 *   }
 *
 * A wrong passphrase fails closed: AES-GCM tag verification throws on decrypt,
 * so tampered or mis-keyed payloads never return partial plaintext.
 */

import crypto from "node:crypto";
import { promisify } from "node:util";

// SAFETY: promisify wraps crypto.scrypt to return Promise<Buffer> when called with keylen and options
const scrypt = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions
) => Promise<Buffer>;

// scrypt cost parameters. N must be a power of two. These are tuned for an
// interactive desktop unlock (~100ms) while staying resistant to brute force.
const SCRYPT_N = 32768; // 2^15
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32; // 256-bit key for AES-256-GCM
const SALT_LENGTH = 16;
const IV_LENGTH = 12; // 96-bit nonce, the GCM standard

export interface SecureEnvelope {
  cmSecure: 1;
  kdf: { algo: "scrypt"; N: number; r: number; p: number; salt: string };
  cipher: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
}

export interface RawSecureEnvelope {
  cmSecure?: number;
  kdf?: { algo?: string; N?: number; r?: number; p?: number; salt?: string };
  cipher?: string;
  iv?: string;
  tag?: string;
  data?: string;
}

/** Type guard: does this parsed JSON look like one of our encrypted envelopes? */
export function isSecureEnvelope(value?: RawSecureEnvelope | null): value is SecureEnvelope {
  if (!value || !value.kdf) {
    return false;
  }
  return value.cmSecure === 1
    && value.cipher === "aes-256-gcm"
    && Boolean(value.iv && value.tag && value.data && value.kdf.salt)
    && Number.isFinite(value.kdf.N)
    && Number.isFinite(value.kdf.r)
    && Number.isFinite(value.kdf.p);
}

async function deriveKey(passphrase: string, salt: Buffer, N = SCRYPT_N, r = SCRYPT_R, p = SCRYPT_P): Promise<Buffer> {
  // maxmem must be raised above the default or scrypt throws for N=32768.
  return scrypt(passphrase.normalize("NFKC"), salt, KEY_LENGTH, { N, r, p, maxmem: 128 * N * r * 2 });
}

/**
 * Encrypt an arbitrary JSON-serialisable value with a passphrase.
 * Returns a portable, self-describing envelope.
 */
export async function sealJson<T>(value: T, passphrase: string): Promise<SecureEnvelope> {
  if (!passphrase || passphrase.length === 0) {
    throw new Error("A passphrase is required to encrypt this data.");
  }
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = await deriveKey(passphrase, salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    cmSecure: 1,
    kdf: { algo: "scrypt", N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, salt: salt.toString("base64") },
    cipher: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64")
  };
}

/**
 * Decrypt an envelope produced by {@link sealJson}.
 * Throws a friendly error when the passphrase is wrong or the payload was
 * tampered with (AES-GCM auth tag mismatch).
 */
export async function openJson<T = unknown>(envelope: SecureEnvelope, passphrase: string): Promise<T> {
  if (!isSecureEnvelope(envelope)) {
    throw new Error("This data is not a valid encrypted Relay envelope.");
  }
  const salt = Buffer.from(envelope.kdf.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  const data = Buffer.from(envelope.data, "base64");
  const key = await deriveKey(passphrase, salt, envelope.kdf.N, envelope.kdf.r, envelope.kdf.p);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    // SAFETY: parsed plaintext object is returned according to caller generic type T
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    throw new Error("Could not decrypt: the passphrase is incorrect or the file has been modified.");
  }
}

/** Encrypt a raw UTF-8 string (e.g. an auth.json blob) to an envelope. */
export async function sealText(text: string, passphrase: string): Promise<SecureEnvelope> {
  return sealJson({ __text: text }, passphrase);
}

interface WrappedText {
  __text?: string;
}

/** Decrypt an envelope produced by {@link sealText} back to the raw string. */
export async function openText(envelope: SecureEnvelope, passphrase: string): Promise<string> {
  const wrapped = await openJson<WrappedText>(envelope, passphrase);
  if (!wrapped || !wrapped.__text) {
    throw new Error("Decrypted payload was not in the expected format.");
  }
  return wrapped.__text;
}
