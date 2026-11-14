function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buffer as any))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// OWASP 2023 recommendation for PBKDF2-HMAC-SHA256
const PBKDF2_ITERATIONS = 600000;
// Iterations used by pre-v1.0.4 hashes (legacy "salt:hash" format)
const LEGACY_PBKDF2_ITERATIONS = 100000;

async function deriveHex(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return bufferToHex(derived);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const derived = await deriveHex(password, salt, PBKDF2_ITERATIONS);

  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bufferToHex(salt)}$${derived}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  // Legacy format "saltHex:hashHex" (PBKDF2 100k) — kept for migration
  const legacyParts = storedHash.split(':');
  if (legacyParts.length === 2) {
    const [saltHex, expectedHex] = legacyParts;
    const derived = await deriveHex(password, hexToBuffer(saltHex), LEGACY_PBKDF2_ITERATIONS);
    return constantTimeEqualHex(derived, expectedHex);
  }

  // Current format "pbkdf2_sha256$iterations$saltHex$hashHex"
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1) return false;

  const derived = await deriveHex(password, hexToBuffer(parts[2]), iterations);
  return constantTimeEqualHex(derived, parts[3]);
}
