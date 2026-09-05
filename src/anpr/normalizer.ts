/**
 * IBVAP — License Plate Text Normalizer
 *
 * Provides deterministic, reversible normalization for plate strings:
 * - Uppercase conversion
 * - Removal of arbitrary whitespace (spaces, tabs, newlines)
 * - Removal of non-alphanumeric punctuation and separators (hyphens, dots, underscores, slashes)
 * - Retains rawText and normalizedText without destructive loss of meaning
 */

export interface NormalizedPlateResult {
  rawText: string;
  normalizedText: string;
  displayPlate: string;
  characterCount: number;
  hasPunctuationRemoved: boolean;
  isValidLength: boolean;
}

/**
 * Normalizes raw OCR license plate string.
 * Strips whitespace, hyphens, dots, and non-alphanumeric punctuation.
 * Transforms to standard uppercase representation.
 */
export function normalizePlateText(raw: string | undefined | null): NormalizedPlateResult {
  const rawText = (raw ?? '').trim();

  // Remove leading/trailing and inner whitespace
  const withoutWhitespace = rawText.replace(/\s+/g, '');

  // Uppercase standard
  const upper = withoutWhitespace.toUpperCase();

  // Strip standard separators: '-', '.', '_', '/', ':', '|'
  const normalizedText = upper.replace(/[^A-Z0-9]/g, '');

  const hasPunctuationRemoved = normalizedText !== upper;
  const characterCount = normalizedText.length;

  // Realistic license plate format (typically 3 to 12 alphanumeric characters)
  const isValidLength = characterCount >= 3 && characterCount <= 12;

  // Formatted display representation (if input had cleanly separated blocks, preserve or standardize)
  const displayPlate = normalizedText;

  return {
    rawText,
    normalizedText,
    displayPlate,
    characterCount,
    hasPunctuationRemoved,
    isValidLength,
  };
}

/**
 * Clean character comparison supporting known optical ambiguity sets
 * without destructive mutation.
 */
export function areCharactersEquivalent(c1: string, c2: string, allowAmbiguity = false): boolean {
  if (c1 === c2) return true;
  if (!allowAmbiguity) return false;

  const u1 = c1.toUpperCase();
  const u2 = c2.toUpperCase();
  if (u1 === u2) return true;

  // Known optical pairs under harsh edge angles: O and 0, I and 1, B and 8, S and 5
  if ((u1 === 'O' && u2 === '0') || (u1 === '0' && u2 === 'O')) return true;
  if ((u1 === 'I' && u2 === '1') || (u1 === '1' && u2 === 'I')) return true;
  if ((u1 === 'B' && u2 === '8') || (u1 === '8' && u2 === 'B')) return true;
  if ((u1 === 'S' && u2 === '5') || (u1 === '5' && u2 === 'S')) return true;

  return false;
}
