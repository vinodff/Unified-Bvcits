// Certificate number generation.
//
// Format: BVCITS-{YYYY}-{SHORT_BATCH}-{SEQUENCE}
// Example: BVCITS-2025-A1B2-00001
//
// The short batch ID is derived from a UUID so every generation run produces a
// distinct prefix. The sequence is zero-padded to 5 digits (supports up to
// 99 999 certificates per batch, well above the 100 000 target).

/**
 * Derives a short 4-character batch tag from a UUID.
 * Uses the first 4 hex characters uppercased — enough to distinguish batches
 * in the same year (65 536 combinations).
 */
export function shortBatchId(batchUuid: string): string {
  return batchUuid.replace(/-/g, "").slice(0, 4).toUpperCase();
}

/**
 * Generates a certificate number for a given index within a batch.
 *
 * @param batchUuid  The batch UUID (used to derive the short batch tag).
 * @param index      Zero-based index of this certificate within the batch.
 * @param year       Calendar year (defaults to current year).
 */
export function generateCertNumber(
  batchUuid: string,
  index: number,
  year: number = new Date().getFullYear(),
): string {
  const batch = shortBatchId(batchUuid);
  const seq = String(index + 1).padStart(5, "0");
  return `BVCITS-${year}-${batch}-${seq}`;
}

/**
 * Generates a fresh batch UUID client-side.
 * Uses crypto.randomUUID when available, otherwise falls back to a simple
 * v4-like generator.
 */
export function newBatchId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
