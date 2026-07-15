/**
 * secureBundle.ts
 *
 * Thin, standalone file IO for profile export bundles. Keeps all
 * encryption/format concerns out of profileStore so the switch/profile
 * logic stays untouched. profileStore just calls writeBundleFile /
 * readBundleFile and works with the plain bundle object.
 *
 * On disk a bundle is EITHER:
 *   - an encrypted envelope (see cryptoBox.SecureEnvelope) — required for all
 *     new exports, OR
 *   - a legacy plaintext bundle JSON (older exports only; still importable).
 *
 * writeBundleFile always seals. readBundleFile transparently handles both.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { isSecureEnvelope, openJson, sealJson } from "./cryptoBox.js";

/** Thrown when an encrypted bundle is opened without (or with a wrong) passphrase. */
export class BundlePassphraseRequiredError extends Error {
  constructor(message = "This export is encrypted. A passphrase is required to import it.") {
    super(message);
    this.name = "BundlePassphraseRequiredError";
  }
}

/**
 * Write a bundle to disk sealed with AES-256-GCM.
 * A non-empty passphrase is required — exports never write auth material as plaintext.
 */
export async function writeBundleFile(filePath: string, bundle: unknown, passphrase: string): Promise<void> {
  if (!passphrase || passphrase.trim().length === 0) {
    throw new Error("A passphrase is required to export accounts. Exports are always encrypted.");
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = await sealJson(bundle, passphrase.trim());
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * Read a bundle from disk, decrypting if it is an encrypted envelope.
 * - Plaintext bundle  -> returned as-is.
 * - Encrypted, no passphrase -> throws BundlePassphraseRequiredError.
 * - Encrypted, wrong passphrase -> throws (friendly message from cryptoBox).
 */
export async function readBundleFile<T = unknown>(filePath: string, passphrase?: string): Promise<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    throw new Error("Could not read the selected file. Make sure it is a valid JSON file.");
  }

  if (isSecureEnvelope(raw)) {
    if (!passphrase || passphrase.length === 0) {
      throw new BundlePassphraseRequiredError();
    }
    return openJson<T>(raw, passphrase);
  }

  return raw as T;
}

/** True when the file on disk is an encrypted bundle (so the UI can prompt). */
export async function isEncryptedBundleFile(filePath: string): Promise<boolean> {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    return isSecureEnvelope(raw);
  } catch {
    return false;
  }
}
