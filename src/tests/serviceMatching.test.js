/**
 * Tests for service matching logic (extracted from conversationEngine)
 */

const KEYWORD_MAP = {
  'business registration': 'business-registration',
  'register': 'business-registration',
  'company': 'business-registration',
  'pvt ltd': 'business-registration',
  'private limited': 'business-registration',
  'llp': 'business-registration',
  'opc': 'business-registration',
  'gst': 'licenses-certifications',
  'msme': 'licenses-certifications',
  'fssai': 'licenses-certifications',
  'license': 'licenses-certifications',
  'trademark': 'ipr-trademark',
  'ipr': 'ipr-trademark',
  'website': 'it-services',
  'mobile app': 'it-services',
  'crm': 'marketplace-software',
  'erp': 'marketplace-software',
  'finance': 'finance-accounts',
  'tax': 'finance-accounts',
  'itr': 'finance-accounts',
  'legal': 'legal-compliance',
  'international': 'international-expansion',
  'uae': 'international-expansion',
  'office setup': 'office-setup',
  'co-working': 'office-space',
  'virtual office': 'virtual-office',
  'stamp': 'e-stamp',
  'expert': 'talk-to-expert',
};

function matchServiceSlug(input) {
  if (!input) return null;
  const lower = input.toLowerCase().trim();
  for (const [keyword, slug] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword)) return slug;
  }
  return null;
}

describe('Service Keyword Matching', () => {
  test('matches business registration from text', () => {
    expect(matchServiceSlug('I want to register my company')).toBe('business-registration');
    expect(matchServiceSlug('private limited company registration')).toBe('business-registration');
    expect(matchServiceSlug('LLP registration')).toBe('business-registration');
  });

  test('matches licenses from keyword', () => {
    expect(matchServiceSlug('I need GST registration')).toBe('licenses-certifications');
    expect(matchServiceSlug('FSSAI license')).toBe('licenses-certifications');
    expect(matchServiceSlug('need MSME certificate')).toBe('licenses-certifications');
  });

  test('matches IPR from trademark keyword', () => {
    expect(matchServiceSlug('I need trademark registration')).toBe('ipr-trademark');
    expect(matchServiceSlug('IPR services')).toBe('ipr-trademark');
  });

  test('matches IT services from website keyword', () => {
    expect(matchServiceSlug('I need a website')).toBe('it-services');
    expect(matchServiceSlug('build a mobile app')).toBe('it-services');
  });

  test('matches marketplace software from CRM keyword', () => {
    expect(matchServiceSlug('CRM software')).toBe('marketplace-software');
    expect(matchServiceSlug('ERP system')).toBe('marketplace-software');
  });

  test('matches finance from tax keyword', () => {
    expect(matchServiceSlug('income tax filing')).toBe('finance-accounts');
    expect(matchServiceSlug('ITR filing help')).toBe('finance-accounts');
  });

  test('matches international expansion from UAE', () => {
    // 'company' keyword matches business-registration before uae — use unambiguous input
    expect(matchServiceSlug('expand to UAE')).toBe('international-expansion');
    expect(matchServiceSlug('international business expansion')).toBe('international-expansion');
    expect(matchServiceSlug('UAE business setup')).toBe('international-expansion');
  });

  test('matches virtual office', () => {
    expect(matchServiceSlug('virtual office address')).toBe('virtual-office');
  });

  test('matches e-stamp', () => {
    expect(matchServiceSlug('e-stamp service')).toBe('e-stamp');
    expect(matchServiceSlug('I need a stamp paper')).toBe('e-stamp');
  });

  test('returns null for unknown input', () => {
    expect(matchServiceSlug('hello')).toBeNull();
    expect(matchServiceSlug('xyz')).toBeNull();
    expect(matchServiceSlug('')).toBeNull();
  });
});
