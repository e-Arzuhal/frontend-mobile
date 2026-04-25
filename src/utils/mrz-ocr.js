/**
 * MRZ OCR — on-device text recognition for Turkish ID cards (TD1 format).
 *
 * Uses ML Kit Text Recognition (on-device, no network, no PII leaves the
 * phone). Requires a dev client / EAS / prebuild APK — the module is safely
 * guarded so the app still runs in Expo Go with OCR disabled.
 */

let TextRecognition = null;
try {
  const mod = require('@react-native-ml-kit/text-recognition');
  TextRecognition = mod?.default || mod;
} catch {
  // Module not available (Expo Go)
}

export const OCR_AVAILABLE = !!TextRecognition;

/**
 * Run OCR on an image URI and try to locate a TD1 MRZ (3 × 30 chars).
 * Returns { line1, line2, line3 } or null if no MRZ was found.
 */
export async function recognizeMrzFromImage(imageUri) {
  if (!TextRecognition) {
    throw new Error('OCR modülü yüklü değil. Uygulamayı EAS / prebuild ile derleyin.');
  }
  const result = await TextRecognition.recognize(imageUri);
  const fullText = typeof result === 'string' ? result : (result?.text || '');
  return extractTd1Lines(fullText);
}

/**
 * Given raw OCR text, find three consecutive lines that look like a TD1
 * MRZ (28-32 chars of [A-Z0-9<]). Normalises character confusables that
 * ML Kit commonly mis-reads on MRZ fonts.
 */
export function extractTd1Lines(rawText) {
  if (!rawText) return null;

  // Step 1: split into lines, normalise each
  const candidates = rawText
    .split(/\r?\n/)
    .map(line => normaliseMrzLine(line))
    .filter(line => line.length >= 28 && line.length <= 34);

  if (candidates.length < 3) return null;

  // Step 2: find three consecutive lines that each pass the MRZ-shape test
  for (let i = 0; i + 2 < candidates.length; i++) {
    const l1 = padTo30(candidates[i]);
    const l2 = padTo30(candidates[i + 1]);
    const l3 = padTo30(candidates[i + 2]);
    if (looksLikeTd1Triplet(l1, l2, l3)) {
      return { line1: l1, line2: l2, line3: l3 };
    }
  }

  // Step 3: fall back to the last three MRZ-shaped candidates
  const tail = candidates.slice(-3).map(padTo30);
  if (tail.length === 3) return { line1: tail[0], line2: tail[1], line3: tail[2] };
  return null;
}

function normaliseMrzLine(line) {
  return line
    .toUpperCase()
    .replace(/\s+/g, '')
    // Common OCR confusions for MRZ fonts
    .replace(/[«»]/g, '<')
    .replace(/[`'‘’]/g, '<')
    .replace(/[‹›]/g, '<')
    // Anything outside the MRZ alphabet becomes '<'
    .replace(/[^A-Z0-9<]/g, '<');
}

function padTo30(line) {
  if (line.length >= 30) return line.slice(0, 30);
  return (line + '<'.repeat(30)).slice(0, 30);
}

/**
 * TD1 heuristic:
 *  - Line 1 starts with 'I' (ID document) followed by a letter (document sub-type)
 *    and then the 3-letter country code.
 *  - Line 2 has a digit-heavy pattern (DOB + check + sex + expiry + check + country).
 *  - Line 3 contains '<<' (the surname / given-name separator).
 */
function looksLikeTd1Triplet(l1, l2, l3) {
  const startsLikeId = /^I[A-Z<]/.test(l1);
  const line2DigitHeavy = (l2.match(/[0-9]/g) || []).length >= 10;
  const nameSeparator = l3.includes('<<');
  return startsLikeId && line2DigitHeavy && nameSeparator;
}
