type Identity = { title: string; year?: number; mediaType: "movie" | "show"; tmdbId?: number; imdbId?: string };
type Offer = { provider: string; type: string; price?: number; currency?: string; url?: string };
type RecordTitle = Identity & { offers: Offer[]; posterUrl?: string; backdropUrl?: string; synopsis?: string; genres?: string[]; score?: number; watchmodeId?: number; watchmodeIds?: number[] };
const normalize = (title: string) => title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function sameTitle(a: Identity, b: Identity) {
  if (a.mediaType !== b.mediaType) return false;
  if (a.imdbId && b.imdbId) return a.imdbId === b.imdbId;
  if (a.tmdbId && b.tmdbId) return a.tmdbId === b.tmdbId;
  return Boolean(a.year && b.year && a.year === b.year && normalize(a.title) === normalize(b.title));
}

export function groupTitleRecords<T extends Identity>(titles: T[]): T[][] {
  const groups: T[][] = [];
  for (const title of titles) {
    // Never bridge two conflicting catalog IDs through a sparse record.
    const group = groups.find((items) => items.every((item) => sameTitle(item, title)));
    if (group) group.push(title); else groups.push([title]);
  }
  return groups;
}

export function mergeTitleRecords<T extends RecordTitle>(titles: T[]): T[] {
  const quality = (title: T) => (title.posterUrl ? 4 : 0) + (title.backdropUrl ? 2 : 0)
    + (title.synopsis && title.synopsis !== "Synopsis unavailable." ? 6 : 0) + (title.genres?.length ? 2 : 0) + (title.score ? 1 : 0);
  return groupTitleRecords(titles).map((group) => {
    const ranked = [...group].sort((a, b) => quality(b) - quality(a));
    const best = ranked[0];
    const offers = new Map<string, Offer>();
    for (const offer of ranked.flatMap((title) => title.offers)) {
      const key = `${offer.provider}:${offer.type}:${offer.price ?? ""}:${offer.currency ?? ""}`;
      const existing = offers.get(key);
      if (!existing || (!existing.url && offer.url)) offers.set(key, offer);
    }
    const posterUrl = ranked.find((title) => title.posterUrl)?.posterUrl;
    const backdropUrl = ranked.find((title) => title.backdropUrl)?.backdropUrl;
    const watchmodeIds = [...new Set(ranked.flatMap((title) => [...(title.watchmodeIds ?? []), ...(title.watchmodeId ? [title.watchmodeId] : [])]))];
    return { ...best, offers: [...offers.values()], ...(posterUrl ? { posterUrl } : {}), ...(backdropUrl ? { backdropUrl } : {}), ...(watchmodeIds.length ? { watchmodeIds } : {}) } as T;
  });
}
