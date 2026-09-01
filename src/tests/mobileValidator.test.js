const {
  validateIndianMobile,
  normalizeIndianMobile,
  fromWhatsAppNumber,
  toWhatsAppNumber,
} = require('../validators/mobileValidator');

describe('validateIndianMobile', () => {
  test('accepts valid 10-digit numbers starting with valid prefix', () => {
    expect(validateIndianMobile('9876543210').valid).toBe(true);
    expect(validateIndianMobile('8765432109').valid).toBe(true);
    expect(validateIndianMobile('7654321098').valid).toBe(true);
    expect(validateIndianMobile('6543210987').valid).toBe(true);
  });

  test('rejects numbers with invalid prefix', () => {
    expect(validateIndianMobile('1234567890').valid).toBe(false);
    expect(validateIndianMobile('5234567890').valid).toBe(false);
  });

  test('rejects numbers that are not 10 digits', () => {
    expect(validateIndianMobile('98765432').valid).toBe(false);
    expect(validateIndianMobile('987654321099').valid).toBe(false);
  });

  test('normalizes +91 prefix', () => {
    const result = validateIndianMobile('+919876543210');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('9876543210');
  });

  test('normalizes 91 prefix (12 digits)', () => {
    const result = validateIndianMobile('919876543210');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('9876543210');
  });

  test('normalizes 0 prefix (0XXXXXXXXXX)', () => {
    const result = validateIndianMobile('09876543210');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('9876543210');
  });

  test('rejects obviously fake numbers (all same digit)', () => {
    expect(validateIndianMobile('9999999999').valid).toBe(false);
    expect(validateIndianMobile('8888888888').valid).toBe(false);
  });

  test('rejects empty/null input', () => {
    expect(validateIndianMobile('').valid).toBe(false);
    expect(validateIndianMobile(null).valid).toBe(false);
    expect(validateIndianMobile(undefined).valid).toBe(false);
  });

  test('strips spaces and dashes from input', () => {
    const result = validateIndianMobile('98765 43210');
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe('9876543210');
  });
});

describe('normalizeIndianMobile', () => {
  test('returns 10-digit number from +91XXXXXXXXXX', () => {
    expect(normalizeIndianMobile('+919876543210')).toBe('9876543210');
  });

  test('returns 10-digit number from 91XXXXXXXXXX', () => {
    expect(normalizeIndianMobile('919876543210')).toBe('9876543210');
  });

  test('returns same 10-digit number unchanged', () => {
    expect(normalizeIndianMobile('9876543210')).toBe('9876543210');
  });

  test('returns null for invalid input', () => {
    expect(normalizeIndianMobile('abc')).toBeNull();
    expect(normalizeIndianMobile('12345')).toBeNull();
  });
});

describe('fromWhatsAppNumber', () => {
  test('extracts 10-digit from 91XXXXXXXXXX format', () => {
    expect(fromWhatsAppNumber('919876543210')).toBe('9876543210');
  });

  test('returns 10-digit as-is', () => {
    expect(fromWhatsAppNumber('9876543210')).toBe('9876543210');
  });
});

describe('toWhatsAppNumber', () => {
  test('prepends 91 to 10-digit number', () => {
    expect(toWhatsAppNumber('9876543210')).toBe('919876543210');
  });
});
