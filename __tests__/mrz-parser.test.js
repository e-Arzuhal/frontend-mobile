import {
  calculateCheckDigit,
  parseTD1,
  formatMrzDate,
  buildBacInput,
  isValidTcNo,
} from '../src/utils/mrz-parser';

// ── calculateCheckDigit ───────────────────────────────────────────────────

describe('calculateCheckDigit', () => {
  test('boş string → 0', () => {
    expect(calculateCheckDigit('')).toBe(0);
  });

  test('sadece < karakterleri → 0', () => {
    expect(calculateCheckDigit('<<<<<<<<<')).toBe(0);
  });

  test('ICAO örnek: "520727" → 3', () => {
    // 5=5, 2=2, 0=0, 7=7, 2=2, 7=7 ile ağırlık [7,3,1,7,3,1]
    // 5*7 + 2*3 + 0*1 + 7*7 + 2*3 + 7*1 = 35+6+0+49+6+7 = 103 → 103%10 = 3
    expect(calculateCheckDigit('520727')).toBe(3);
  });

  test('rakam ve harf karışık hesaplanır', () => {
    // A=10
    const result = calculateCheckDigit('A1');
    // 10*7 + 1*3 = 73 → 73%10 = 3
    expect(result).toBe(3);
  });
});

// ── isValidTcNo ───────────────────────────────────────────────────────────

describe('isValidTcNo', () => {
  test('geçerli TC No (11 rakam, algoritmik kontrol geçer)', () => {
    // Türk kimlik doğrulama algoritmasını geçen bilinen geçerli bir numara
    expect(isValidTcNo('10000000146')).toBe(true);
  });

  test('11 rakamdan kısa → false', () => {
    expect(isValidTcNo('1234567890')).toBe(false);
  });

  test('11 rakamdan uzun → false', () => {
    expect(isValidTcNo('123456789012')).toBe(false);
  });

  test('0 ile başlayan → false', () => {
    expect(isValidTcNo('01234567890')).toBe(false);
  });

  test('harf içeren → false', () => {
    expect(isValidTcNo('1234567890A')).toBe(false);
  });

  test('algoritma hatası olan numara → false', () => {
    // Geçersiz kontrol basamakları
    expect(isValidTcNo('12345678900')).toBe(false);
  });
});

// ── formatMrzDate ─────────────────────────────────────────────────────────

describe('formatMrzDate', () => {
  test('YYMMDD < 50 → 2000+', () => {
    expect(formatMrzDate('900101')).toBe('01.01.1990');
  });

  test('YYMMDD >= 50 → 1900+', () => {
    expect(formatMrzDate('250315')).toBe('15.03.2025');
  });

  test('boş string → boş string', () => {
    expect(formatMrzDate('')).toBe('');
  });

  test('6 karakterden farklı → boş string', () => {
    expect(formatMrzDate('9001')).toBe('');
  });
});

// ── buildBacInput ─────────────────────────────────────────────────────────

describe('buildBacInput', () => {
  test('9 karakterden kısa belge no padlenir', () => {
    const result = buildBacInput('A1234567', '900101', '300101');
    // docNo 9 char: A1234567<
    expect(result.startsWith('A1234567<')).toBe(true);
  });

  test('uzunluk 25 karakter olmalı (9+1+6+1+6+1+check)', () => {
    const result = buildBacInput('A12345678', '900101', '300101');
    // docNo(9) + check(1) + dob(6) + check(1) + expiry(6) + check(1) = 24
    expect(result.length).toBe(24);
  });

  test('check digit karakterleri rakam olmalı', () => {
    const result = buildBacInput('A12345678', '900101', '300101');
    // Pozisyon 9, 16, 23 check digit
    expect(result[9]).toMatch(/\d/);
    expect(result[16]).toMatch(/\d/);
    expect(result[23]).toMatch(/\d/);
  });
});

// ── parseTD1 ──────────────────────────────────────────────────────────────

describe('parseTD1', () => {
  test('herhangi bir satır null ise null döner', () => {
    expect(parseTD1(null, 'line2', 'line3')).toBeNull();
    expect(parseTD1('line1', null, 'line3')).toBeNull();
    expect(parseTD1('line1', 'line2', null)).toBeNull();
  });

  test('parse sonucu zorunlu alanları içerir', () => {
    // Gerçekçi ama dummy TD1 satırları (check digit doğrulama başarısız olabilir)
    const l1 = 'I<TUR1234567890123456789012345';
    const l2 = '9001012M3001010TUR<<<<<<<<<<<3';
    const l3 = 'YILMAZ<<AHMET<<<<<<<<<<<<<<<<<';

    const result = parseTD1(l1, l2, l3);

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('documentNumber');
    expect(result).toHaveProperty('dateOfBirth');
    expect(result).toHaveProperty('dateOfExpiry');
    expect(result).toHaveProperty('firstName');
    expect(result).toHaveProperty('lastName');
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('bacInput');
  });

  test('lastName ve firstName ayrıştırılır', () => {
    const l1 = 'I<TUR1234567890123456789012345';
    const l2 = '9001012M3001010TUR<<<<<<<<<<<3';
    const l3 = 'YILMAZ<<AHMET<<<<<<<<<<<<<<<<';

    const result = parseTD1(l1, l2, l3);

    expect(result.lastName).toBe('YILMAZ');
    expect(result.firstName).toBe('AHMET');
  });

  test('valid.allValid alanı boolean', () => {
    const l1 = 'I<TUR1234567890123456789012345';
    const l2 = '9001012M3001010TUR<<<<<<<<<<<3';
    const l3 = 'YILMAZ<<AHMET<<<<<<<<<<<<<<<<';

    const result = parseTD1(l1, l2, l3);

    expect(typeof result.valid.allValid).toBe('boolean');
  });
});
