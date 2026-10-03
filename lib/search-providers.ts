import { normalizedService } from "@/lib/offer-priority";
export type ProviderOffer = { provider: string; type: "included" | "free" | "rent" | "buy"; quality: "HD" | "4K"; price?: number; currency?: string; url?: string };
type Providers = { provider_name?: string }[];
type Regional = { link?: string; flatrate?: Providers; free?: Providers; ads?: Providers; rent?: Providers; buy?: Providers };
const cache = new Map<string, { expires: number; offers: ProviderOffer[] | undefined }>();
export async function catalogProviderOffers(id: number, mediaType: "movie" | "show", region: string) {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) return undefined;
  const key = `${mediaType}:${id}:${region}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.offers;
  try {
    const response = await fetch(`https://api.themoviedb.org/3/${mediaType === "movie" ? "movie" : "tv"}/${id}/watch/providers`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    if (!response.ok) return undefined;
    const data = await response.json() as { results?: Record<string, Regional> };
    const regional = data.results?.[region];
    const offers = regional ? ([ [regional.flatrate, "included"], [regional.free, "free"], [regional.ads, "free"], [regional.rent, "rent"], [regional.buy, "buy"] ] as const).flatMap(([providers, type]) => (providers ?? []).flatMap(({ provider_name }) => provider_name ? [{ provider: provider_name, type, quality: "HD" as const, ...(regional.link?.startsWith("https://") ? { url: regional.link } : {}) }] : [])) : undefined;
    cache.set(key, { expires: Date.now() + 300_000, offers });
    while (cache.size > 200) cache.delete(cache.keys().next().value!);
    return offers;
  } catch { return undefined; }
}
export function mergeProviderOffers(primary: ProviderOffer[], supplemental: ProviderOffer[]) {
  const offers = [...primary];
  const seen = new Set(primary.map((offer) => `${normalizedService(offer.provider)}:${offer.type}`));
  for (const offer of supplemental) {
    const key = `${normalizedService(offer.provider)}:${offer.type}`;
    if (!seen.has(key)) { offers.push(offer); seen.add(key); }
  }
  return offers;
}
