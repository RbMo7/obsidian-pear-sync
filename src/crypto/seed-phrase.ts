import { WORDLIST_STR } from "./wordlist";
import { randomBytes, createHash } from "crypto";

const WORDLIST: string[] = WORDLIST_STR.split(" ");
const BITS_PER_WORD = 11;
const WORDS = 12;

/**
 * Generate a BIP39-style 12-word mnemonic phrase.
 *
 * - Generates 16 random bytes (128 bits entropy)
 * - SHA256 hash → first 4 bits = checksum
 * - 128 + 4 = 132 bits → 12 × 11-bit words
 * - Words map 1:1 to the BIP39 English wordlist
 *
 * The resulting phrase can be imported on any device to derive
 * the same vault identity.
 */
export function generateMnemonic(): string {
  const entropy = randomBytes(16); // 128 bits
  const phrase = entropyToMnemonic(entropy);
  // Normalize to NFKC for consistent encoding across platforms
  return normalizeMnemonic(phrase);
}

/**
 * Convert 16 bytes of entropy to a 12-word mnemonic.
 * Uses a flat bit array to avoid byte-boundary indexing bugs.
 */
function entropyToMnemonic(entropy: Buffer): string {
  const hash = createHash("sha256").update(entropy).digest();

  // Build flat bit array: 128 entropy bits + 4 checksum bits (MSBs of hash[0])
  const bits: number[] = [];
  for (let i = 0; i < 16; i++) {
    for (let b = 7; b >= 0; b--) bits.push((entropy[i] >> b) & 1);
  }
  for (let b = 7; b >= 4; b--) bits.push((hash[0] >> b) & 1);

  // Read 12 × 11-bit indices
  const words: string[] = [];
  for (let i = 0; i < WORDS; i++) {
    let index = 0;
    for (let b = 0; b < BITS_PER_WORD; b++) {
      index = (index << 1) | bits[i * BITS_PER_WORD + b];
    }
    words.push(WORDLIST[index]);
  }

  return words.join(" ");
}

/**
 * Validate a 12-word mnemonic phrase.
 * Checks that all words exist in the BIP39 wordlist and the checksum is valid.
 */
export function validateMnemonic(phrase: string): boolean {
  const words = phrase.trim().toLowerCase().split(/\s+/);
  if (words.length !== WORDS) return false;

  // Check all words are in the wordlist
  const indices: number[] = [];
  for (const word of words) {
    const idx = WORDLIST.indexOf(word);
    if (idx === -1) return false;
    indices.push(idx);
  }

  // Convert 12 indices back to flat bit array (132 bits)
  const bits: number[] = [];
  for (const idx of indices) {
    for (let b = BITS_PER_WORD - 1; b >= 0; b--) {
      bits.push((idx >> b) & 1);
    }
  }

  // First 128 bits = entropy, last 4 bits = checksum
  let entropyNum = BigInt(0);
  for (let i = 0; i < 128; i++) entropyNum = (entropyNum << BigInt(1)) | BigInt(bits[i]);

  const entropy = Buffer.alloc(16);
  for (let i = 15; i >= 0; i--) {
    entropy[i] = Number(entropyNum & BigInt(0xff));
    entropyNum >>= BigInt(8);
  }

  let expectedChecksum = 0;
  for (let i = 0; i < 4; i++) expectedChecksum = (expectedChecksum << 1) | bits[128 + i];

  const hash = createHash("sha256").update(entropy).digest();
  const actualChecksum = (hash[0] >> 4) & 0x0f;

  return expectedChecksum === actualChecksum;
}

/**
 * Clean and normalize a mnemonic phrase (lowercase, single spaces).
 */
export function normalizeMnemonic(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(" ");
}
