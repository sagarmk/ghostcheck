/**
 * Typosquat detection using Levenshtein distance.
 *
 * Compares unknown package names against the known package registry
 * to find suspiciously similar names that may indicate typosquatting
 * or hallucinated package names.
 */

/**
 * Typosquat detection result.
 */
export interface TyposquatMatch {
  /** The known package that matched */
  readonly knownPackage: string;
  /** Levenshtein distance (lower = more similar) */
  readonly distance: number;
  /** Similarity ratio (0.0–1.0, higher = more similar) */
  readonly similarity: number;
}

/**
 * Compute the Levenshtein distance between two strings.
 * Uses the Wagner-Fischer dynamic programming algorithm.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Optimize for common cases
  if (m === 0) return n;
  if (n === 0) return m;
  if (a === b) return 0;

  // Use single-row optimization (O(min(m,n)) space)
  const shorter = m < n ? a : b;
  const longer = m < n ? b : a;
  const shortLen = shorter.length;
  const longLen = longer.length;

  let prevRow = new Array<number>(shortLen + 1);
  for (let j = 0; j <= shortLen; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= longLen; i++) {
    const currentRow = new Array<number>(shortLen + 1);
    currentRow[0] = i;

    for (let j = 1; j <= shortLen; j++) {
      const cost = longer[i - 1] === shorter[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        currentRow[j - 1]! + 1, // insertion
        prevRow[j]! + 1, // deletion
        prevRow[j - 1]! + cost, // substitution
      );
    }

    prevRow = currentRow;
  }

  return prevRow[shortLen]!;
}

/**
 * Compute similarity ratio from Levenshtein distance.
 */
export function similarityRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Typosquat detector — finds suspiciously similar package names.
 */
export class TyposquatDetector {
  /** Threshold: packages within this distance are flagged */
  private readonly _maxDistance: number;

  constructor(maxDistance = 2) {
    this._maxDistance = maxDistance;
  }

  /**
   * Find the closest known packages to a given package name.
   * Returns matches sorted by distance (ascending).
   */
  findClosest(packageName: string, knownPackages: readonly string[]): TyposquatMatch[] {
    const matches: TyposquatMatch[] = [];

    for (const known of knownPackages) {
      // Quick length-based pre-filter
      if (Math.abs(packageName.length - known.length) > this._maxDistance) continue;

      const distance = levenshteinDistance(packageName, known);
      if (distance > 0 && distance <= this._maxDistance) {
        matches.push({
          knownPackage: known,
          distance,
          similarity: similarityRatio(packageName, known),
        });
      }
    }

    return matches.sort((a, b) => a.distance - b.distance);
  }
}
