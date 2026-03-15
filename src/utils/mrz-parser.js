/**
 * MRZ Parser for Turkish ID Cards (TC Kimlik Kartı)
 *
 * Turkish ID cards use TD1 format (3 lines × 30 characters):
 * Line 1: Document type + Country + Document Number + Check Digit + Optional Data
 * Line 2: DOB + Check + Sex + Expiry + Check + Nationality + Optional + Overall Check
 * Line 3: Name (SURNAME<<FIRSTNAME)
 *
 * For BAC authentication, we need: documentNumber, dateOfBirth, dateOfExpiry
 */

const MRZ_WEIGHTS = [7, 3, 1];

/**
 * Calculate MRZ check digit for a given string.
 * Characters: 0-9 = 0-9, A-Z = 10-35, < = 0
 */
export function calculateCheckDigit(str) {
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    let val;
    if (ch >= '0' && ch <= '9') val = ch.charCodeAt(0) - 48;
    else if (ch >= 'A' && ch <= 'Z') val = ch.charCodeAt(0) - 55;
    else val = 0; // '<' and others
    sum += val * MRZ_WEIGHTS[i % 3];
  }
  return sum % 10;
}

/**
 * Parse a TD1 MRZ (3 lines of 30 characters each).
 * Returns extracted fields or null if parsing fails.
 */
export function parseTD1(line1, line2, line3) {
  if (!line1 || !line2 || !line3) return null;
  // Clean and pad lines
  const l1 = (line1.replace(/\s/g, '').toUpperCase() + '<'.repeat(30)).slice(0, 30);
  const l2 = (line2.replace(/\s/g, '').toUpperCase() + '<'.repeat(30)).slice(0, 30);
  const l3 = (line3.replace(/\s/g, '').toUpperCase() + '<'.repeat(30)).slice(0, 30);

  // Line 1: I<TUR + documentNo(9) + checkDigit(1) + optional(15)
  const documentType = l1.slice(0, 2);
  const issuingCountry = l1.slice(2, 5);
  const documentNumber = l1.slice(5, 14).replace(/<+$/, '');
  const documentNumberCheck = parseInt(l1[14], 10);
  const optionalData1 = l1.slice(15, 30).replace(/<+$/, '');

  // Line 2: DOB(6) + check(1) + sex(1) + expiry(6) + check(1) + nationality(3) + optional(11) + overallCheck(1)
  const dateOfBirth = l2.slice(0, 6);
  const dobCheck = parseInt(l2[6], 10);
  const sex = l2[7];
  const dateOfExpiry = l2.slice(8, 14);
  const expiryCheck = parseInt(l2[14], 10);
  const nationality = l2.slice(15, 18);
  const optionalData2 = l2.slice(18, 29).replace(/<+$/, '');
  const overallCheck = parseInt(l2[29], 10);

  // Line 3: Name (SURNAME<<FIRSTNAME<<...)
  const nameParts = l3.replace(/<+$/, '').split('<<');
  const lastName = (nameParts[0] || '').replace(/</g, ' ').trim();
  const firstName = (nameParts.slice(1).join(' ') || '').replace(/</g, ' ').trim();

  // Validate check digits
  const docNumValid = calculateCheckDigit(l1.slice(5, 14)) === documentNumberCheck;
  const dobValid = calculateCheckDigit(dateOfBirth) === dobCheck;
  const expiryValid = calculateCheckDigit(dateOfExpiry) === expiryCheck;

  // Overall check: docNo + check + optionalData1 + DOB + check + expiry + check + optionalData2
  const overallStr = l1.slice(5, 30) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
  const overallValid = calculateCheckDigit(overallStr) === overallCheck;

  // Extract TC No from optional data (Turkish ID cards store TC No in optional field)
  const tcNo = optionalData1.replace(/[^0-9]/g, '').slice(0, 11) || optionalData2.replace(/[^0-9]/g, '').slice(0, 11);

  return {
    documentType,
    issuingCountry,
    documentNumber,
    dateOfBirth,     // YYMMDD
    dateOfExpiry,    // YYMMDD
    sex,
    nationality,
    firstName,
    lastName,
    tcNo,
    optionalData1,
    optionalData2,
    valid: {
      documentNumber: docNumValid,
      dateOfBirth: dobValid,
      dateOfExpiry: expiryValid,
      overall: overallValid,
      allValid: docNumValid && dobValid && expiryValid,
    },
    // Raw MRZ info string for BAC key derivation
    // Format: documentNo(9) + check + DOB(6) + check + expiry(6) + check
    bacInput: l1.slice(5, 15) + l2.slice(0, 7) + l2.slice(8, 15),
  };
}

/**
 * Format YYMMDD to human-readable date string.
 */
export function formatMrzDate(yymmdd) {
  if (!yymmdd || yymmdd.length !== 6) return '';
  const yy = parseInt(yymmdd.slice(0, 2), 10);
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);
  // Assume 2000+ for years < 50, 1900+ otherwise
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  return `${dd}.${mm}.${year}`;
}

/**
 * Build BAC input string from individual fields.
 * documentNumber: up to 9 chars, padded with '<'
 * dateOfBirth: YYMMDD
 * dateOfExpiry: YYMMDD
 */
export function buildBacInput(documentNumber, dateOfBirth, dateOfExpiry) {
  // Pad document number to 9 chars with '<'
  const docNo = (documentNumber + '<<<<<<<<<').slice(0, 9);
  const docNoCheck = calculateCheckDigit(docNo);
  const dobCheck = calculateCheckDigit(dateOfBirth);
  const expiryCheck = calculateCheckDigit(dateOfExpiry);

  return docNo + docNoCheck + dateOfBirth + dobCheck + dateOfExpiry + expiryCheck;
}

/**
 * Validate TC Kimlik No with the Turkish checksum algorithm.
 */
export function isValidTcNo(tcNo) {
  if (!/^\d{11}$/.test(tcNo)) return false;
  if (tcNo[0] === '0') return false;
  const d = tcNo.split('').map(Number);
  const d10 = ((7 * (d[0] + d[2] + d[4] + d[6] + d[8]) - (d[1] + d[3] + d[5] + d[7])) % 10 + 10) % 10;
  if (d[9] !== d10) return false;
  const sum = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return d[10] === sum % 10;
}
