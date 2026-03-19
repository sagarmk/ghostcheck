/**
 * Bloom filter for fast negative lookups.
 *
 * Before hitting SQLite for exact package existence checks,
 * the bloom filter provides O(1) rejection of definitely-unknown
 * packages with a ~1% false positive rate.
 */

import { createHash } from 'node:crypto';

/**
 * Bloom filter implementation.
 *
 * Uses k hash functions over a bit array of size m.
 * False positive rate ≈ (1 - e^(-kn/m))^k
 *
 * For 1M items with 1% FP rate:
 *   m ≈ 9.6M bits (1.2 MB)
 *   k ≈ 7 hash functions
 */
export class BloomFilter {
  private readonly _bits: Uint8Array;
  private readonly _size: number;
  private readonly _hashCount: number;

  /**
   * Create a bloom filter.
   *
   * @param expectedItems  Expected number of items
   * @param falsePositiveRate  Target false positive rate (default 0.01 = 1%)
   */
  constructor(expectedItems: number, falsePositiveRate = 0.01) {
    // Calculate optimal bit array size: m = -n*ln(p) / (ln(2))^2
    this._size = Math.ceil((-expectedItems * Math.log(falsePositiveRate)) / Math.log(2) ** 2);

    // Calculate optimal hash count: k = (m/n) * ln(2)
    this._hashCount = Math.max(1, Math.round((this._size / expectedItems) * Math.log(2)));

    // Allocate bit array (using bytes, 8 bits each)
    this._bits = new Uint8Array(Math.ceil(this._size / 8));
  }

  get size(): number {
    return this._size;
  }

  get hashCount(): number {
    return this._hashCount;
  }

  /**
   * Add an item to the filter.
   */
  add(item: string): void {
    const hashes = this._getHashes(item);
    for (const hash of hashes) {
      const index = hash % this._size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      this._bits[byteIndex]! |= 1 << bitIndex;
    }
  }

  /**
   * Check if an item might be in the filter.
   *
   * - Returns false: item is DEFINITELY not in the set
   * - Returns true: item MIGHT be in the set (possible false positive)
   */
  mightContain(item: string): boolean {
    const hashes = this._getHashes(item);
    for (const hash of hashes) {
      const index = hash % this._size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      if ((this._bits[byteIndex]! & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Generate k hash values for an item using double hashing.
   * h_i(x) = (h1(x) + i * h2(x)) mod m
   */
  private _getHashes(item: string): number[] {
    const hash = createHash('sha256').update(item).digest();

    // Use first 8 bytes for h1, next 8 bytes for h2
    const h1 = hash.readUInt32BE(0);
    const h2 = hash.readUInt32BE(4);

    const hashes: number[] = [];
    for (let i = 0; i < this._hashCount; i++) {
      hashes.push(Math.abs((h1 + i * h2) | 0));
    }
    return hashes;
  }

  /**
   * Serialize the bloom filter to a Buffer for storage.
   */
  serialize(): Buffer {
    const header = Buffer.alloc(12);
    header.writeUInt32BE(this._size, 0);
    header.writeUInt32BE(this._hashCount, 4);
    header.writeUInt32BE(this._bits.length, 8);
    return Buffer.concat([header, Buffer.from(this._bits)]);
  }

  /**
   * Deserialize a bloom filter from a Buffer.
   */
  static deserialize(buffer: Buffer): BloomFilter {
    const size = buffer.readUInt32BE(0);
    const hashCount = buffer.readUInt32BE(4);
    const bitsLength = buffer.readUInt32BE(8);

    const filter = new BloomFilter(1); // Dummy constructor
    (filter as unknown as { _size: number })._size = size;
    (filter as unknown as { _hashCount: number })._hashCount = hashCount;
    (filter as unknown as { _bits: Uint8Array })._bits = new Uint8Array(
      buffer.subarray(12, 12 + bitsLength),
    );

    return filter;
  }
}
