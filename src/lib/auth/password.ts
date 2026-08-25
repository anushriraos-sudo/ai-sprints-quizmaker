/**
 * Password hashing for Quiz Maker.
 *
 * Server-only. Never import this from a file marked `'use client'`.
 *
 * A plain-text password is never stored, logged, or returned. It exists only as
 * an argument to the two functions below, for the duration of a single call.
 */

const ALGORITHM_LABEL = "pbkdf2";
const SALT_BYTES = 16;
const KEY_BITS = 256;

/**
 * Chosen to fit the Cloudflare Workers **Free plan** budget of 10 ms CPU per
 * invocation, not because it is a good iteration count.
 *
 * Measured on the Workers runtime: 20,000 iterations costs ~6 ms per hash,
 * leaving a little headroom for the rest of the request. For reference,
 * 100,000 costs ~33 ms and OWASP's recommended 600,000 costs ~207 ms — 20× the
 * entire Free-plan budget. This value is therefore roughly 30× below current
 * guidance and is a deliberate, documented compromise.
 *
 * Argon2id was evaluated as a stronger alternative and does not help: Workers
 * refuses runtime WebAssembly compilation, and even a working build could not
 * reach OWASP's minimum profile inside 10 ms.
 *
 * Raise this to 600,000 if the project moves to the Workers Paid plan. Existing
 * rows stay valid because each hash records the count it was created with.
 */
const ITERATIONS = 20_000;

/**
 * Refuse to re-derive above this cost. A stored hash always comes from our own
 * database rather than from user input, but a corrupted or tampered row
 * claiming millions of iterations would otherwise let a single login request
 * exhaust the Worker's CPU budget.
 */
const MAX_ITERATIONS = 1_000_000;

/**
 * A syntactically valid hash that no password verifies against.
 *
 * Login uses this when the email is unknown, so that the request still pays the
 * full PBKDF2 cost. Returning early instead would make "no such account"
 * measurably faster than "wrong password" and leak which emails are registered.
 *
 * Its iteration count must track {@link ITERATIONS}. If the two drift apart,
 * the unknown-email path costs visibly more or less than a real verification
 * and reintroduces the timing signal this constant exists to remove.
 */
export const DUMMY_PASSWORD_HASH =
  "pbkdf2$20000$doMgpHsN2yTanES1QdgYiw==$qusJeNsJcFNOHwBaIcoU0KXrXKNRfwToo+0s8h5R8cM=";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// The `<ArrayBuffer>` argument is load-bearing: a bare `Uint8Array` widens to
// `Uint8Array<ArrayBufferLike>`, which TypeScript will not accept as a
// `BufferSource` because it could be backed by a SharedArrayBuffer.
async function deriveKey(
  plain: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(plain), "PBKDF2", false, [
    "deriveBits",
  ]);

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    keyMaterial,
    KEY_BITS,
  );

  return new Uint8Array(bits);
}

/**
 * Compare without leaking, through timing, how many leading bytes matched.
 *
 * Workers exposes a native constant-time comparison. Node does not, and
 * `npm run dev` runs on Node, so fall back to a branchless loop there rather
 * than crashing in development.
 */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (x: ArrayBufferView, y: ArrayBufferView) => boolean;
  };

  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(a, b);
  }

  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a[i] ^ b[i];
  }
  return difference === 0;
}

/**
 * Derive a storable hash of `plain` using a freshly generated random salt.
 *
 * The returned string carries its own algorithm, cost, and salt, so the
 * iteration count can be raised later without invalidating existing rows.
 *
 * Format: `pbkdf2$<iterations>$<saltBase64>$<hashBase64>`
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await deriveKey(plain, salt, ITERATIONS);
  return `${ALGORITHM_LABEL}$${ITERATIONS}$${toBase64(salt)}$${toBase64(derived)}`;
}

/**
 * Check `plain` against a hash previously produced by {@link hashPassword}.
 *
 * Fails closed: a malformed, truncated, or unrecognized `stored` value returns
 * `false` rather than throwing, so a single bad row cannot turn a failed login
 * into a 500.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 4) {
      return false;
    }

    const [label, rawIterations, saltBase64, hashBase64] = parts;
    if (label !== ALGORITHM_LABEL) {
      return false;
    }

    const iterations = Number(rawIterations);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_ITERATIONS) {
      return false;
    }

    const salt = fromBase64(saltBase64);
    const expected = fromBase64(hashBase64);
    const actual = await deriveKey(plain, salt, iterations);

    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}
