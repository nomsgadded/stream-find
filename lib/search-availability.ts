// Opportunistic, bounded hints. A cache miss is unknown, never "unavailable".
type Offer = { provider: string; type: string };
type Entry = { expires: number; offers: Offer[] };
const hints = new Map<string, Entry>();
export function rememberSearchAvailability(ids: number[], region: string, offers: Offer[]) {
  for (const id of ids) {
    const key = `${region}:${id}`;
    hints.delete(key);
    hints.set(key, { expires: Date.now() + 300_000, offers: offers.map(({ provider, type }) => ({ provider, type })) });
  }
  while (hints.size > 500) hints.delete(hints.keys().next().value!);
}
export function searchAvailability(id: number, region: string) {
  const key = `${region}:${id}`;
  const entry = hints.get(key);
  if (!entry) return undefined;
  if (entry.expires < Date.now()) { hints.delete(key); return undefined; }
  return entry.offers;
}
