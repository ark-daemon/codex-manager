/**
 * secureBundle.ts
 *
 * Thin, standalone file IO for profile export bundles. Keeps all
 * encryption/format concerns out of profileStore so the switch/profile
 * logic stays untouched. profileStore just calls writeBundleFile /
 * readBundleFile and works with the plain bundle object.
 *
 * On disk a bundle is EITHER:
 *   - an encrypted envelope (see cryptoBox.SecureEnvelope), when a passphrase
 *     was supplied at export time, OR
 *   - a legacy plaintext bundle JSON (older exports, or when the user opts
 *     out of encryption).
 *
 * readBundleFile transparently handles both.
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
 * Write a bundle to disk. When `passphrase` is provided the bundle is sealed
 * as an AES-256-GCM envelope; otherwise it is written as legacy plaintext.
 */
export async function writeBundleFile(filePath: string, bundle: unknown, passphrase?: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const payload = passphrase && passphrase.length > 0
    ? await sealJson(bundle, passphrase)
    : bundle;
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
