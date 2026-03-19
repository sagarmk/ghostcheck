/**
 * Package verification module — verifies package existence,
 * detects typosquatting, checks CVEs, and scores supply chain risk.
 */

export { PackageVerifier } from './verifier.js';
export { TyposquatDetector } from './typosquat.js';
export { BloomFilter } from './bloom-filter.js';
