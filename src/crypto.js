import { stringToHex, keccak256, toHex } from 'viem';

/**
 * Convert a string secret to a padded bytes32 hex value
 * suitable for passing to initiateExecution().
 */
export function toBytes32(str) {
  return stringToHex(str, { size: 32 });
}

/**
 * Hash a secret string with keccak256 — matches the
 * on-chain commitmentHash used in initialize().
 */
export function hashSecret(str) {
  const bytes = stringToHex(str, { size: 32 });
  return keccak256(bytes);
}
