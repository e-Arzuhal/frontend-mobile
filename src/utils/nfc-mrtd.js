/**
 * NFC MRTD Protocol Implementation
 * ICAO 9303 - BAC (Basic Access Control) authentication + DG1 reading
 *
 * This module handles the complete MRTD communication:
 * 1. BAC key derivation from MRZ data
 * 2. Mutual authentication with the chip
 * 3. Secure messaging establishment
 * 4. DG1 (personal data) reading and parsing
 */

import CryptoJS from 'crypto-js';

// ─── Byte helpers ────────────────────────────────────────────────────────────

function hexToBytes(hex) {
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

function bytesToHex(bytes) {
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function bytesToWordArray(bytes) {
  return CryptoJS.lib.WordArray.create(new Uint8Array(bytes));
}

function wordArrayToBytes(wa) {
  const bytes = [];
  for (let i = 0; i < wa.sigBytes; i++) {
    bytes.push((wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff);
  }
  return bytes;
}

function randomBytes(n) {
  const bytes = [];
  for (let i = 0; i < n; i++) {
    bytes.push(Math.floor(Math.random() * 256));
  }
  return bytes;
}

function xorBytes(a, b) {
  const result = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    result.push(a[i] ^ b[i]);
  }
  return result;
}

// ─── DES Parity Adjustment ──────────────────────────────────────────────────

function adjustParity(keyBytes) {
  const adjusted = [];
  for (let i = 0; i < keyBytes.length; i++) {
    let b = keyBytes[i] & 0xfe;
    // Count bits
    let bits = 0;
    let temp = b;
    while (temp) { bits += temp & 1; temp >>= 1; }
    // Set parity bit (odd parity)
    if (bits % 2 === 0) b |= 1;
    adjusted.push(b);
  }
  return adjusted;
}

// ─── Key Derivation ─────────────────────────────────────────────────────────

/**
 * Derive BAC keys (Ka for encryption, Kb for MAC) from MRZ info string.
 * MRZ info = docNo(9) + check(1) + DOB(6) + check(1) + expiry(6) + check(1)
 */
export function deriveKeys(mrzInfoString) {
  // Step 1: Hash MRZ info string
  const mrzBytes = [];
  for (let i = 0; i < mrzInfoString.length; i++) {
    mrzBytes.push(mrzInfoString.charCodeAt(i));
  }
  const hash = CryptoJS.SHA1(bytesToWordArray(mrzBytes));
  const Kseed = wordArrayToBytes(hash).slice(0, 16);

  // Step 2: Derive Ka (encryption key) with counter = 1
  const Ka = deriveKey(Kseed, 1);
  // Step 3: Derive Kb (MAC key) with counter = 2
  const Kb = deriveKey(Kseed, 2);

  return { Ka, Kb };
}

function deriveKey(Kseed, counter) {
  // D = Kseed + counter (4 bytes big-endian)
  const D = [...Kseed, 0, 0, 0, counter];
  const hash = CryptoJS.SHA1(bytesToWordArray(D));
  const H = wordArrayToBytes(hash);

  // Ka or Kb = adjustParity(H[0:8]) + adjustParity(H[8:16])
  const keyA = adjustParity(H.slice(0, 8));
  const keyB = adjustParity(H.slice(8, 16));
  return [...keyA, ...keyB];
}

// ─── 3DES Encryption/Decryption ─────────────────────────────────────────────

const ZERO_IV = new Array(8).fill(0);

function des3Encrypt(key, data, iv = null) {
  const keyWA = bytesToWordArray(key);
  const dataWA = bytesToWordArray(data);
  const ivWA = bytesToWordArray(iv || ZERO_IV);

  const encrypted = CryptoJS.TripleDES.encrypt(dataWA, keyWA, {
    iv: ivWA,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding,
  });
  return wordArrayToBytes(encrypted.ciphertext);
}

function des3Decrypt(key, data, iv = null) {
  const keyWA = bytesToWordArray(key);
  const ivWA = bytesToWordArray(iv || ZERO_IV);

  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: bytesToWordArray(data),
  });
  const decrypted = CryptoJS.TripleDES.decrypt(cipherParams, keyWA, {
    iv: ivWA,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding,
  });
  return wordArrayToBytes(decrypted);
}

function desEncryptSingle(key8, block8) {
  const keyWA = bytesToWordArray(key8);
  const dataWA = bytesToWordArray(block8);
  const ivWA = bytesToWordArray(ZERO_IV);

  const encrypted = CryptoJS.DES.encrypt(dataWA, keyWA, {
    iv: ivWA,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding,
  });
  return wordArrayToBytes(encrypted.ciphertext);
}

function desDecryptSingle(key8, block8) {
  const keyWA = bytesToWordArray(key8);
  const ivWA = bytesToWordArray(ZERO_IV);

  const cipherParams = CryptoJS.lib.CipherParams.create({
    ciphertext: bytesToWordArray(block8),
  });
  const decrypted = CryptoJS.DES.decrypt(cipherParams, keyWA, {
    iv: ivWA,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.NoPadding,
  });
  return wordArrayToBytes(decrypted);
}

/**
 * ICAO 9303 Part 11: IV selection for Secure Messaging encryption.
 *
 *   - BAC-SM (3DES-CBC): IV = 0x00..00 (zero IV). SSC does NOT participate
 *     in the encryption IV — it only participates in the MAC input.
 *   - PACE-SM (AES-CBC): IV = E(KSenc, SSC).
 *
 * Since this module implements BAC (3DES), we use a zero IV.
 * (Using E(KSenc, SSC) here causes the chip to return SW=6988.)
 */
function computeEncIV(_KSenc, _ssc) {
  return ZERO_IV;
}

// ─── Retail MAC (ISO 9797-1 Algorithm 3, Padding Method 2) ─────────────────

function retailMac(key16, data) {
  const K1 = key16.slice(0, 8);
  const K2 = key16.slice(8, 16);

  // Padding Method 2: append 0x80, then 0x00 until block boundary
  const padded = [...data, 0x80];
  while (padded.length % 8 !== 0) padded.push(0x00);

  // CBC-MAC with single DES K1
  let prev = new Array(8).fill(0);
  for (let i = 0; i < padded.length; i += 8) {
    const block = xorBytes(padded.slice(i, i + 8), prev);
    prev = desEncryptSingle(K1, block);
  }

  // Final: decrypt with K2, then encrypt with K1
  const decrypted = desDecryptSingle(K2, prev);
  const mac = desEncryptSingle(K1, decrypted);

  return mac;
}

// ─── APDU Construction ──────────────────────────────────────────────────────

function buildApdu(cla, ins, p1, p2, data = null, le = null) {
  const apdu = [cla, ins, p1, p2];
  if (data && data.length > 0) {
    apdu.push(data.length);
    apdu.push(...data);
  }
  if (le !== null) {
    apdu.push(le);
  }
  return apdu;
}

// ─── Secure Messaging ───────────────────────────────────────────────────────

function incrementSSC(ssc) {
  const newSsc = [...ssc];
  for (let i = newSsc.length - 1; i >= 0; i--) {
    newSsc[i] = (newSsc[i] + 1) & 0xff;
    if (newSsc[i] !== 0) break;
  }
  return newSsc;
}

function padData(data) {
  const padded = [...data, 0x80];
  while (padded.length % 8 !== 0) padded.push(0x00);
  return padded;
}

function unpadData(data) {
  let i = data.length - 1;
  while (i >= 0 && data[i] === 0x00) i--;
  if (i >= 0 && data[i] === 0x80) return data.slice(0, i);
  return data;
}

function buildSecureApdu(apdu, KSenc, KSmac, ssc) {
  const cla = apdu[0] | 0x0c; // Set secure messaging bit
  const ins = apdu[1];
  const p1 = apdu[2];
  const p2 = apdu[3];

  let cmdData = null;
  let le = null;

  // Parse original APDU
  if (apdu.length === 5) {
    // Case 2: header + Le
    le = apdu[4];
  } else if (apdu.length > 5) {
    const lc = apdu[4];
    cmdData = apdu.slice(5, 5 + lc);
    if (apdu.length > 5 + lc) {
      le = apdu[5 + lc];
    }
  }

  // Increment SSC for this command
  ssc = incrementSSC(ssc);

  // ICAO 9303: IV = E(KSenc, SSC)
  const encIV = computeEncIV(KSenc, ssc);

  // Build DO'87 (encrypted data) if command has data
  let do87 = [];
  if (cmdData && cmdData.length > 0) {
    const paddedCmdData = padData(cmdData);
    const encData = des3Encrypt(KSenc, paddedCmdData, encIV);
    // TLV: 87 + length + 01 (padding indicator) + encrypted data
    const do87Data = [0x01, ...encData];
    do87 = [0x87, ...encodeTlvLength(do87Data.length), ...do87Data];
  }

  // Build DO'97 (expected length) if Le present
  let do97 = [];
  if (le !== null) {
    do97 = [0x97, 0x01, le];
  }

  // Build MAC input: SSC || padded(CmdHeader) || DO'87 || DO'97
  const paddedHeader = padData([cla, ins, p1, p2]);
  let macData = [...ssc, ...paddedHeader];
  if (do87.length > 0) macData.push(...do87);
  if (do97.length > 0) macData.push(...do97);

  // Compute retail MAC (padding method 2 applied inside retailMac)
  const mac = retailMac(KSmac, macData);

  // Build DO'8E (MAC)
  const do8e = [0x8e, 0x08, ...mac];

  // Build final secure APDU
  const secData = [...do87, ...do97, ...do8e];
  const finalApdu = [cla, ins, p1, p2, secData.length, ...secData, 0x00];

  return { apdu: finalApdu, ssc };
}

function verifyAndDecryptResponse(response, KSenc, KSmac, ssc) {
  ssc = incrementSSC(ssc);

  if (response.length < 2) throw new Error('Response too short');

  const sw1 = response[response.length - 2];
  const sw2 = response[response.length - 1];
  const respData = response.slice(0, response.length - 2);

  // Parse TLV objects from response
  let do87Data = null;
  let do99Data = null;
  let do8eData = null;
  let offset = 0;

  while (offset < respData.length) {
    const tag = respData[offset++];
    const { length, bytesRead } = decodeTlvLength(respData, offset);
    offset += bytesRead;
    const value = respData.slice(offset, offset + length);
    offset += length;

    if (tag === 0x87) do87Data = value;
    else if (tag === 0x99) do99Data = value;
    else if (tag === 0x8e) do8eData = value;
  }

  // ICAO 9303: IV = E(KSenc, SSC)
  const encIV = computeEncIV(KSenc, ssc);

  // Decrypt DO87 if present
  let decryptedData = null;
  if (do87Data && do87Data.length > 1) {
    // Skip padding indicator byte (0x01)
    const encData = do87Data.slice(1);
    const paddedDecrypted = des3Decrypt(KSenc, encData, encIV);
    decryptedData = unpadData(paddedDecrypted);
  }

  return { data: decryptedData, sw1, sw2, ssc };
}

// ─── TLV Helpers ────────────────────────────────────────────────────────────

function encodeTlvLength(length) {
  if (length < 0x80) return [length];
  if (length < 0x100) return [0x81, length];
  return [0x82, (length >> 8) & 0xff, length & 0xff];
}

function decodeTlvLength(data, offset) {
  const first = data[offset];
  if (first < 0x80) return { length: first, bytesRead: 1 };
  if (first === 0x81) return { length: data[offset + 1], bytesRead: 2 };
  if (first === 0x82) return { length: (data[offset + 1] << 8) | data[offset + 2], bytesRead: 3 };
  return { length: first, bytesRead: 1 };
}

// ─── DG1 Parser ─────────────────────────────────────────────────────────────

/**
 * Parse DG1 data (contains MRZ lines).
 * DG1 TLV structure: 61 [len] 5F1F [len] [MRZ data]
 */
export function parseDG1(data) {
  if (!data || data.length < 4) return null;

  let offset = 0;
  // Outer tag: 0x61
  if (data[offset] !== 0x61) return null;
  offset++;
  const { length: outerLen, bytesRead: outerBytes } = decodeTlvLength(data, offset);
  offset += outerBytes;

  // Inner tag: 0x5F1F
  if (data[offset] !== 0x5f || data[offset + 1] !== 0x1f) return null;
  offset += 2;
  const { length: innerLen, bytesRead: innerBytes } = decodeTlvLength(data, offset);
  offset += innerBytes;

  // MRZ data
  const mrzBytes = data.slice(offset, offset + innerLen);
  const mrzString = String.fromCharCode(...mrzBytes);

  // TD1: 90 chars = 3 lines × 30
  if (mrzString.length >= 90) {
    return {
      type: 'TD1',
      line1: mrzString.slice(0, 30),
      line2: mrzString.slice(30, 60),
      line3: mrzString.slice(60, 90),
      raw: mrzString,
    };
  }
  // TD3: 88 chars = 2 lines × 44
  if (mrzString.length >= 88) {
    return {
      type: 'TD3',
      line1: mrzString.slice(0, 44),
      line2: mrzString.slice(44, 88),
      raw: mrzString,
    };
  }

  return { type: 'UNKNOWN', raw: mrzString };
}

// ─── Main MRTD Communication ────────────────────────────────────────────────

/**
 * Perform BAC authentication and read DG1 from a TC Kimlik Kartı.
 *
 * @param {Function} transceive - Function to send APDU and receive response
 * @param {string} bacInputString - MRZ info string for key derivation
 *   Format: docNo(9) + check(1) + DOB(6) + check(1) + expiry(6) + check(1)
 * @returns {object} - Parsed personal data from DG1
 */
export async function readMrtdData(transceive, bacInputString) {
  // Step 1: Derive BAC keys
  const { Ka, Kb } = deriveKeys(bacInputString);

  // Step 2: Select MRTD application
  // SELECT eMRTD AID: A0000002471001
  const selectAid = [0x00, 0xa4, 0x04, 0x0c, 0x07, 0xa0, 0x00, 0x00, 0x02, 0x47, 0x10, 0x01];
  const selectResp = await transceive(selectAid);
  const selectSw = (selectResp[selectResp.length - 2] << 8) | selectResp[selectResp.length - 1];
  if (selectSw !== 0x9000 && selectSw !== 0x6a82) {
    throw new Error(`eMRTD uygulama seçimi başarısız: ${selectSw.toString(16)}`);
  }

  // Step 3: GET CHALLENGE - get random nonce from chip
  const getChallenge = [0x00, 0x84, 0x00, 0x00, 0x08];
  const challengeResp = await transceive(getChallenge);
  if (challengeResp.length < 10) {
    throw new Error('GET CHALLENGE yanıtı çok kısa');
  }
  const RND_IC = challengeResp.slice(0, 8);

  // Step 4: Perform MUTUAL AUTHENTICATE
  const RND_IFD = randomBytes(8);
  const K_IFD = randomBytes(16);

  // S = RND_IFD + RND_IC + K_IFD (32 bytes)
  const S = [...RND_IFD, ...RND_IC, ...K_IFD];

  // Encrypt S with Ka
  const E_IFD = des3Encrypt(Ka, S);

  // MAC of E_IFD with Kb
  const M_IFD = retailMac(Kb, E_IFD);

  // Build MUTUAL AUTHENTICATE command
  const mutAuthData = [...E_IFD, ...M_IFD];
  const mutAuth = [0x00, 0x82, 0x00, 0x00, 0x28, ...mutAuthData, 0x28];
  const mutAuthResp = await transceive(mutAuth);

  if (mutAuthResp.length < 42) {
    throw new Error('BAC doğrulaması başarısız — belge numarası, doğum tarihi veya son kullanma tarihi yanlış olabilir.');
  }

  // Decrypt response
  const E_IC = mutAuthResp.slice(0, 32);
  const M_IC = mutAuthResp.slice(32, 40);

  // Verify MAC
  const expectedMac = retailMac(Kb, E_IC);
  if (bytesToHex(M_IC) !== bytesToHex(expectedMac)) {
    throw new Error('BAC MAC doğrulaması başarısız.');
  }

  // Decrypt E_IC
  const R = des3Decrypt(Ka, E_IC);
  const RND_IC_received = R.slice(0, 8);
  const RND_IFD_received = R.slice(8, 16);
  const K_IC = R.slice(16, 32);

  // Verify RND_IFD matches
  if (bytesToHex(RND_IFD_received) !== bytesToHex(RND_IFD)) {
    throw new Error('BAC doğrulaması başarısız — RND_IFD eşleşmiyor.');
  }

  // Step 5: Derive session keys
  const Kseed_session = xorBytes(K_IFD, K_IC);
  const KSenc = deriveKey(Kseed_session, 1);
  const KSmac = deriveKey(Kseed_session, 2);

  // Initialize SSC = RND_IC[4:8] + RND_IFD[4:8]
  let ssc = [...RND_IC.slice(4, 8), ...RND_IFD.slice(4, 8)];

  // Step 6: Select DG1 with secure messaging
  // SELECT EF.DG1: file ID 0x0101
  // NOTE: ICAO 9303 / many MRTD chips require Le=0x00 on SM-wrapped commands
  // so that DO'97 is present in the envelope. Without it, the chip returns
  // SW=6988 ("Incorrect data objects in SM"). Make this Case 4 with Le=0.
  const selectDG1 = buildApdu(0x00, 0xa4, 0x02, 0x0c, [0x01, 0x01], 0x00);
  const secSelectDG1 = buildSecureApdu(selectDG1, KSenc, KSmac, ssc);
  ssc = secSelectDG1.ssc;

  const selectDG1Resp = await transceive(secSelectDG1.apdu);

  // Check SELECT DG1 response status
  const selSw1 = selectDG1Resp[selectDG1Resp.length - 2];
  const selSw2 = selectDG1Resp[selectDG1Resp.length - 1];
  const selSw = (selSw1 << 8) | selSw2;
  // Increment SSC for response
  ssc = incrementSSC(ssc);

  if (selSw !== 0x9000) {
    throw new Error(`DG1 dosya seçimi başarısız (SW: ${selSw.toString(16)}). Güvenli mesajlaşma hatası olabilir.`);
  }

  // Step 7: Read DG1 - first read header to get total length
  const readHeader = buildApdu(0x00, 0xb0, 0x00, 0x00, null, 0x04);
  const secReadHeader = buildSecureApdu(readHeader, KSenc, KSmac, ssc);
  ssc = secReadHeader.ssc;

  const headerResp = await transceive(secReadHeader.apdu);
  const headerResult = verifyAndDecryptResponse(headerResp, KSenc, KSmac, ssc);
  ssc = headerResult.ssc;

  if (!headerResult.data || headerResult.data.length < 2) {
    // Provide detailed error with status word info
    const hSw = (headerResult.sw1 << 8) | headerResult.sw2;
    throw new Error(`DG1 header okunamadı (SW: ${hSw.toString(16)}). Kartı sabit tuttuğunuzdan emin olun.`);
  }

  // Parse TLV to get total DG1 length
  let dg1TotalLength;
  const headerData = headerResult.data;
  if (headerData[1] < 0x80) {
    dg1TotalLength = headerData[1] + 2;
  } else if (headerData[1] === 0x81) {
    dg1TotalLength = headerData[2] + 3;
  } else if (headerData[1] === 0x82) {
    dg1TotalLength = ((headerData[2] << 8) | headerData[3]) + 4;
  } else {
    dg1TotalLength = 200; // fallback
  }

  // Read DG1 in chunks
  const chunkSize = 0xdf; // Max read size with secure messaging
  let dg1Data = [];
  let readOffset = 0;

  while (readOffset < dg1TotalLength) {
    const toRead = Math.min(chunkSize, dg1TotalLength - readOffset);
    const p1 = (readOffset >> 8) & 0xff;
    const p2 = readOffset & 0xff;

    const readCmd = buildApdu(0x00, 0xb0, p1, p2, null, toRead);
    const secReadCmd = buildSecureApdu(readCmd, KSenc, KSmac, ssc);
    ssc = secReadCmd.ssc;

    const readResp = await transceive(secReadCmd.apdu);
    const readResult = verifyAndDecryptResponse(readResp, KSenc, KSmac, ssc);
    ssc = readResult.ssc;

    if (!readResult.data || readResult.data.length === 0) break;
    dg1Data.push(...readResult.data);
    readOffset += readResult.data.length;

    if (readResult.data.length < toRead) break;
  }

  // Step 8: Parse DG1
  const dg1 = parseDG1(dg1Data);
  if (!dg1) {
    throw new Error('DG1 verisi ayrıştırılamadı.');
  }

  return dg1;
}

/**
 * High-level function: Read Turkish ID card via NFC.
 * @param {Function} transceive - Function to send APDU and receive response
 * @param {string} documentNumber - Document number from MRZ (front of card)
 * @param {string} dateOfBirth - YYMMDD format
 * @param {string} dateOfExpiry - YYMMDD format
 */
export async function readTurkishIdCard(transceive, documentNumber, dateOfBirth, dateOfExpiry) {
  const { buildBacInput } = await import('./mrz-parser');
  const bacInput = buildBacInput(documentNumber, dateOfBirth, dateOfExpiry);
  return readMrtdData(transceive, bacInput);
}
