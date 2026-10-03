export type RegionConfig = {
  code: string;
  name: string;
  currency: string;
  timezone: string;
};

export const regions: RegionConfig[] = [
  { code: "US", name: "United States", currency: "USD", timezone: "America/Los_Angeles" },
  { code: "CA", name: "Canada", currency: "CAD", timezone: "America/Toronto" },
  { code: "GB", name: "United Kingdom", currency: "GBP", timezone: "Europe/London" },
  { code: "AU", name: "Australia", currency: "AUD", timezone: "Australia/Sydney" },
  { code: "NZ", name: "New Zealand", currency: "NZD", timezone: "Pacific/Auckland" },
  { code: "IE", name: "Ireland", currency: "EUR", timezone: "Europe/Dublin" },
  { code: "DE", name: "Germany", currency: "EUR", timezone: "Europe/Berlin" },
  { code: "FR", name: "France", currency: "EUR", timezone: "Europe/Paris" },
  { code: "ES", name: "Spain", currency: "EUR", timezone: "Europe/Madrid" },
  { code: "IT", name: "Italy", currency: "EUR", timezone: "Europe/Rome" },
  { code: "NL", name: "Netherlands", currency: "EUR", timezone: "Europe/Amsterdam" },
  { code: "BE", name: "Belgium", currency: "EUR", timezone: "Europe/Brussels" },
  { code: "AT", name: "Austria", currency: "EUR", timezone: "Europe/Vienna" },
  { code: "CH", name: "Switzerland", currency: "CHF", timezone: "Europe/Zurich" },
  { code: "SE", name: "Sweden", currency: "SEK", timezone: "Europe/Stockholm" },
  { code: "NO", name: "Norway", currency: "NOK", timezone: "Europe/Oslo" },
  { code: "DK", name: "Denmark", currency: "DKK", timezone: "Europe/Copenhagen" },
  { code: "FI", name: "Finland", currency: "EUR", timezone: "Europe/Helsinki" },
  { code: "BR", name: "Brazil", currency: "BRL", timezone: "America/Sao_Paulo" },
  { code: "MX", name: "Mexico", currency: "MXN", timezone: "America/Mexico_City" },
  { code: "AR", name: "Argentina", currency: "ARS", timezone: "America/Argentina/Buenos_Aires" },
  { code: "IN", name: "India", currency: "INR", timezone: "Asia/Kolkata" },
  { code: "JP", name: "Japan", currency: "JPY", timezone: "Asia/Tokyo" },
  { code: "KR", name: "South Korea", currency: "KRW", timezone: "Asia/Seoul" },
];

export function getRegionConfig(value: string | null | undefined) {
  const code = value?.trim().toUpperCase();
  return regions.find((region) => region.code === code) ?? regions[0];
}
