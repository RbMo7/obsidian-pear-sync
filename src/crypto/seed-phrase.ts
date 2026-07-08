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
 */
function entropyToMnemonic(entropy: Buffer): string {
  const hash = createHash("sha256").update(entropy).digest();
  const checksumBits = hash[0] >> 4; // first 4 bits

  // Combine entropy bytes + checksum into 11-bit chunks
  const bits: number[] = [];
  for (let i = 0; i < 16; i++) bits.push(entropy[i]);
  bits.push(checksumBits); // 129th "byte" with only 4 bits

  // Convert to 12 words of 11 bits each
  const words: string[] = [];
  for (let i = 0; i < WORDS; i++) {
    let index = 0;
    const startBit = i * BITS_PER_WORD;
    const startByte = Math.floor(startBit / 8);
    const bitOffset = startBit % 8;

    // Build 11-bit index across byte boundaries
    for (let b = 0; b < BITS_PER_WORD; b++) {
      const byteIdx = startByte + Math.floor((bitOffset + b) / 8);
      const bitIdx = (bitOffset + b) % 8;
      const byteVal = byteIdx < 16 ? bits[byteIdx] : checksumBits;
      if (byteVal & (1 << (7 - bitIdx))) {
        index |= 1 << (10 - b);
      }
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

  // Convert 12 indices (11 bits each) back to entropy + checksum
  const bits: number[] = [];
  let bitBuf = 0;
  let bitsInBuf = 0;

  for (const idx of indices) {
    bitBuf = (bitBuf << BITS_PER_WORD) | idx;
    bitsInBuf += BITS_PER_WORD;

    while (bitsInBuf >= 8) {
      bitsInBuf -= 8;
      bits.push((bitBuf >> bitsInBuf) & 0xff);
    }
  }

  // bits now has 17 "bytes" — first 16 are entropy, last is checksum nibble
  const entropy = Buffer.from(bits.slice(0, 16));
  const expectedChecksum = bits[16] >> 4;

  const hash = createHash("sha256").update(entropy).digest();
  const actualChecksum = hash[0] >> 4;

  return expectedChecksum === actualChecksum;
}

/**
 * Clean and normalize a mnemonic phrase (lowercase, single spaces).
 */
export function normalizeMnemonic(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(" ");
}
