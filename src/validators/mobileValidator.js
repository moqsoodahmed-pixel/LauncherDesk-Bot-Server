/**
 * Indian Mobile Number Validator
 * Validates and normalizes Indian mobile numbers.
 * Valid prefixes: 6, 7, 8, 9 (TRAI-assigned mobile prefixes)
 */

const VALID_PREFIXES = ['6', '7', '8', '9'];

/**
 * Normalize an Indian mobile number to 10 digits.
 * Accepts: +91XXXXXXXXXX, 91XXXXXXXXXX, XXXXXXXXXX, 0XXXXXXXXXX
 * Returns null if the number cannot be normalized.
 */
function normalizeIndianMobile(input) {
  if (!input || typeof input !== 'string') return null;

  // Strip all whitespace, dashes, dots, parentheses
  let cleaned = input.replace(/[\s\-\.\(\)]/g, '').trim();

  // Remove leading +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Remove country code 91 if present
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  }

  // Remove leading 0 (some users type 0XXXXXXXXXX)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  // Must be exactly 10 digits now
  if (!/^\d{10}$/.test(cleaned)) return null;

  return cleaned;
}

/**
 * Validate a normalized 10-digit Indian mobile number.
 * Returns { valid: boolean, normalized: string|null, error: string|null }
 */
function validateIndianMobile(input) {
  const normalized = normalizeIndianMobile(input);

  if (!normalized) {
    return {
      valid: false,
      normalized: null,
      error: 'Please enter a valid 10-digit Indian mobile number.',
    };
  }

  if (!VALID_PREFIXES.includes(normalized[0])) {
    return {
      valid: false,
      normalized: null,
      error:
        'The number you entered does not appear to be a valid Indian mobile number. Please try again.',
    };
  }

  // Reject obviously fake numbers (all same digit, sequential etc.)
  if (/^(\d)\1{9}$/.test(normalized)) {
    return {
      valid: false,
      normalized: null,
      error: 'Please enter a real 10-digit Indian mobile number.',
    };
  }

  return { valid: true, normalized, error: null };
}

/**
 * Format a normalized number for display: +91 XXXXX XXXXX
 */
function formatForDisplay(normalized) {
  if (!normalized || normalized.length !== 10) return normalized;
  return `+91 ${normalized.slice(0, 5)} ${normalized.slice(5)}`;
}

/**
 * Get the canonical WhatsApp number (with country code, no +)
 * MSG91 expects numbers like 919876543210
 */
function toWhatsAppNumber(normalized) {
  return `91${normalized}`;
}

/**
 * Extract 10-digit normalized number from a WhatsApp/MSG91 number
 * (which typically comes as 91XXXXXXXXXX or +91XXXXXXXXXX)
 */
function fromWhatsAppNumber(waNumber) {
  if (!waNumber) return null;
  let cleaned = String(waNumber).replace(/\D/g, '');
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return cleaned.slice(2);
  }
  if (cleaned.length === 10 && VALID_PREFIXES.includes(cleaned[0])) {
    return cleaned;
  }
  return null;
}

module.exports = {
  normalizeIndianMobile,
  validateIndianMobile,
  formatForDisplay,
  toWhatsAppNumber,
  fromWhatsAppNumber,
};
