// Map a member's geolocation to one of four buckets for the distribution chart.
export type Region = 'USA' | 'EU' | 'UK' | 'Other';

// EU member-state ISO 3166-1 alpha-2 codes.
const EU_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

/** Extract the ISO country code from Ghost's geolocation JSON string. */
export function parseCountryCode(geolocation: string | null): string | null {
  if (!geolocation) return null;
  try {
    const g = JSON.parse(geolocation) as { country_code?: string };
    return g.country_code ? g.country_code.toUpperCase() : null;
  } catch {
    return null;
  }
}

export function regionForCountry(countryCode: string | null): Region {
  if (!countryCode) return 'Other';
  const cc = countryCode.toUpperCase();
  if (cc === 'US') return 'USA';
  if (cc === 'GB' || cc === 'UK') return 'UK';
  if (EU_CODES.has(cc)) return 'EU';
  return 'Other';
}
