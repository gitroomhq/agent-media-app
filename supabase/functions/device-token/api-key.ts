/**
 * API key generation helper using Web Crypto (crypto.subtle).
 *
 * Generates a random API key with the `ma_` prefix, hashes it with SHA-256,
 * and returns both the raw key (shown once to the user) and the hex-encoded
 * hash (stored in the database).
 *
 * Key format: ma_<48 random hex chars>  (total 51 chars)
 * Hash:       SHA-256 hex digest of the full key
 * Prefix:     First 8 chars after "ma_" for display (e.g. "ma_a1b2c3d4")
 */

const API_KEY_PREFIX = "ma_";
const RANDOM_BYTES = 24; // 24 bytes = 48 hex chars

export interface GeneratedApiKey {
  /** Full raw API key -- show once, never store in plaintext */
  rawKey: string;
  /** SHA-256 hex hash of rawKey -- store in api_keys.key_hash */
  keyHash: string;
  /** Display prefix, e.g. "ma_a1b2" -- store in api_keys.key_prefix */
  keyPrefix: string;
}

/**
 * Generate a cryptographically secure API key, its SHA-256 hash, and display prefix.
 */
export async function generateApiKey(): Promise<GeneratedApiKey> {
  // Generate random bytes
  const randomBytes = new Uint8Array(RANDOM_BYTES);
  crypto.getRandomValues(randomBytes);

  // Convert to hex string
  const hexString = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const rawKey = `${API_KEY_PREFIX}${hexString}`;

  // Hash with SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  // Convert hash to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Display prefix: "ma_" + first 8 hex chars
  const keyPrefix = rawKey.substring(0, API_KEY_PREFIX.length + 8);

  return { rawKey, keyHash, keyPrefix };
}
