/**
 * Unit tests for authStorage.ts
 *
 * Electron's safeStorage is mocked so tests run in Vitest (jsdom / Node)
 * without a real Electron host. Scenarios tested:
 * 1. Encryption available \u2014 write encrypts (CMENC1), read decrypts, migration works.
 * 2. Encryption unavailable \u2014 write REFUSES plaintext: it throws without a
 *    session passphrase, and seals with a CMPWD1 envelope when one is set.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PassphraseRequiredError,
  migrateAuthFile,
  readAuthFile,
  setSafeStorageBackendForTest,
  writeAuthFile
} from "../electron/services/authStorage.js";
import { clearSessionPassphrase, setSessionPassphrase } from "../electron/services/sessionKey.js";

// ─── Minimal safeStorage mock ──────────────────────────────────────────

/**
 * A trivial XOR cipher so we can verify round-trip without a real OS keychain.
 * The key byte (0x42) is arbitrary — just needs to be consistent.
 */
const KEY = 0x42;
const encryptString = vi.fn((plaintext: string): Buffer => {
  const buf = Buffer.from(plaintext, "utf8");
  for (let i = 0; i < buf.length; i++) buf[i] ^= KEY;
  return buf;
});
const decryptString = vi.fn((cipherBuf: Buffer): string => {
  const buf = Buffer.from(cipherBuf); // copy so we don't mutate the original
  for (let i = 0; i < buf.length; i++) buf[i] ^= KEY;
  return buf.toString("utf8");
});

let _encryptionAvailable = true;
const isEncryptionAvailable = vi.fn(() => _encryptionAvailable);

// ─── Helpers ──────────────────────────────────────────────────────────

let tmpDir = "";

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "auth-storage-test-"));
  _encryptionAvailable = true;
  setSafeStorageBackendForTest({ isEncryptionAvailable, encryptString, decryptString });
  clearSessionPassphrase();
  vi.clearAllMocks();
  // Restore mock implementations that clearAllMocks may have cleared.
  encryptString.mockImplementation((plaintext: string): Buffer => {
    const buf = Buffer.from(plaintext, "utf8");
    for (let i = 0; i < buf.length; i++) buf[i] ^= KEY;
    return buf;
  });
  decryptString.mockImplementation((cipherBuf: Buffer): string => {
    const buf = Buffer.from(cipherBuf);
    for (let i = 0; i < buf.length; i++) buf[i] ^= KEY;
    return buf.toString("utf8");
  });
  isEncryptionAvailable.mockImplementation(() => _encryptionAvailable);
});

afterEach(async () => {
  clearSessionPassphrase();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

const authPath = () => path.join(tmpDir, "auth.json");
const SAMPLE = JSON.stringify({ access_token: "tok_abc", email: "x@example.com" }, null, 2) + "\n";

// \u2500\u2500\u2500 Tests \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

describe("writeAuthFile + readAuthFile (encryption available)", () => {
  it("writes encrypted bytes and reads them back as plaintext", async () => {
    const encrypted = await writeAuthFile(authPath(), SAMPLE);
    expect(encrypted).toBe(true);

    // On-disk content must NOT be readable as plain JSON.
    const raw = await fs.readFile(authPath());
    expect(() => JSON.parse(raw.toString("utf8"))).toThrow();

    // readAuthFile must recover the original text.
    const result = await readAuthFile(authPath());
    expect(result).toBe(SAMPLE);
  });

  it("calls encryptString once and decryptString once", async () => {
    await writeAuthFile(authPath(), SAMPLE);
    expect(encryptString).toHaveBeenCalledTimes(1);
    expect(encryptString).toHaveBeenCalledWith(SAMPLE);

    await readAuthFile(authPath());
    expect(decryptString).toHaveBeenCalledTimes(1);
  });

  it("creates intermediate directories", async () => {
    const nested = path.join(tmpDir, "a", "b", "auth.json");
    await writeAuthFile(nested, SAMPLE);
    expect(await fs.access(nested).then(() => true).catch(() => false)).toBe(true);
  });
});

describe("writeAuthFile + readAuthFile (encryption unavailable)", () => {
  beforeEach(() => { _encryptionAvailable = false; clearSessionPassphrase(); });
  afterEach(() => { clearSessionPassphrase(); });

  it("refuses to write plaintext and throws when no keychain and no passphrase", async () => {
    // SECURITY: the old plaintext fallback is gone. With neither a keychain nor
    // a session passphrase, writeAuthFile must refuse rather than leak tokens.
    await expect(writeAuthFile(authPath(), SAMPLE)).rejects.toBeInstanceOf(PassphraseRequiredError);

    // If any file was created, it must not be readable plaintext JSON.
    const exists = await fs.access(authPath()).then(() => true).catch(() => false);
    if (exists) {
      const raw = await fs.readFile(authPath());
      expect(() => JSON.parse(raw.toString("utf8"))).toThrow();
    }
  });

  it("seals with the session passphrase (CMPWD1) and reads it back", async () => {
    setSessionPassphrase("correct horse battery staple");
    const usedKeychain = await writeAuthFile(authPath(), SAMPLE);
    // Sealed via passphrase, not the OS keychain.
    expect(usedKeychain).toBe(false);

    const raw = await fs.readFile(authPath());
    // On disk it must be the CMPWD1 envelope, never plain JSON.
    expect(raw.slice(0, 7).toString("ascii")).toBe("CMPWD1:");
    expect(() => JSON.parse(raw.toString("utf8"))).toThrow();

    const result = await readAuthFile(authPath());
    expect(result).toBe(SAMPLE);
  });

  it("reads legacy plain text files correctly", async () => {
    await fs.writeFile(authPath(), SAMPLE, "utf8");
    const result = await readAuthFile(authPath());
    expect(result).toBe(SAMPLE);
  });
});

describe("readAuthFile edge cases", () => {
  it("returns undefined when file does not exist", async () => {
    const result = await readAuthFile(path.join(tmpDir, "nonexistent.json"));
    expect(result).toBeUndefined();
  });

  it("can read a plain-text file even when encryption is available", async () => {
    // Files written before encryption was introduced should still be readable.
    await fs.writeFile(authPath(), SAMPLE, "utf8");
    _encryptionAvailable = true;
    const result = await readAuthFile(authPath());
    expect(result).toBe(SAMPLE);
  });
});

describe("migrateAuthFile", () => {
  it("encrypts a plain-text file and returns 'encrypted'", async () => {
    await fs.writeFile(authPath(), SAMPLE, "utf8");
    const result = await migrateAuthFile(authPath());
    expect(result).toBe("encrypted");

    // After migration the file should be decryptable.
    const roundTripped = await readAuthFile(authPath());
    expect(roundTripped).toBe(SAMPLE);
  });

  it("returns 'skipped' for a file that is already encrypted", async () => {
    await writeAuthFile(authPath(), SAMPLE); // write encrypted
    const result = await migrateAuthFile(authPath());
    expect(result).toBe("skipped");
  });

  it("returns 'missing' when the file does not exist", async () => {
    const result = await migrateAuthFile(path.join(tmpDir, "no-such-file.json"));
    expect(result).toBe("missing");
  });

  it("returns 'unavailable' when neither keychain nor passphrase is available", async () => {
    _encryptionAvailable = false;
    clearSessionPassphrase();
    await fs.writeFile(authPath(), SAMPLE, "utf8");
    const result = await migrateAuthFile(authPath());
    expect(result).toBe("unavailable");
  });
});
