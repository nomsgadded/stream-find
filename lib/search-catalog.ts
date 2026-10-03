import { normalizeSearch, parseSearch, searchLookupTerm, searchMatchScore } from "@/lib/search-matching";

export type CatalogTitle = {
  id: number; tmdbId: number; title: string; originalTitle?: string; year?: number;
  mediaType: "movie" | "show"; imageUrl?: string; synopsis: string; score: number; corrected?: boolean;
};
const cache = new Map<string, { expires: number; titles: CatalogTitle[] }>();
type TmdbSearchResult = {
  id?: number; media_type?: string; adult?: boolean; title?: string; name?: string;
  original_title?: string; original_name?: string; release_date?: string; first_air_date?: string;
  poster_path?: string | null; overview?: string; vote_average?: number;
};

export function typoRetrievalQueries(query: string) {
  const term = parseSearch(query).term;
  if (term.length < 5 || !/^[a-z0-9 ]+$/.test(term)) return [];
  const words = term.split(" ");
  const longest = words.reduce((best, word, index) => word.length > words[best].length ? index : best, 0);
  const candidates = words.length > 1 ? [words.filter((_, index) => index !== longest).join(" ")] : [];
  candidates.push(words[longest].slice(0, Math.max(3, words[longest].length - 2)));
  if (words.length === 1) candidates.push(term.slice(0, 3));
  return [...new Set(candidates)].filter((value) => value.length >= 3 && value !== term).slice(0, 2);
}

async function lookup(query: string, token: string): Promise<CatalogTitle[]> {
  const url = new URL("https://api.themoviedb.org/3/search/multi");
  url.searchParams.set("query", query);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("include_adult", "false");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error("Catalog search unavailable");
  const data = await response.json() as { results?: TmdbSearchResult[] };
  if (!Array.isArray(data.results)) throw new Error("Invalid catalog response");
  return data.results.flatMap((item): CatalogTitle[] => {
    if (!["movie", "tv"].includes(item.media_type ?? "") || item.adult || typeof item.id !== "number" || !Number.isSafeInteger(item.id) || item.id <= 0) return [];
    const title = (item.title || item.name)?.trim();
    if (!title) return [];
    const mediaType = item.media_type === "movie" ? "movie" : "show";
    const year = Number((item.release_date || item.first_air_date || "").slice(0, 4)) || undefined;
    return [{ id: -(mediaType === "movie" ? 1_000_000_000 : 2_000_000_000) - item.id,
      tmdbId: item.id, title, originalTitle: item.original_title || item.original_name,
      mediaType, year, synopsis: item.overview?.trim() || "Synopsis unavailable.",
      score: Math.round((item.vote_average || 0) * 10),
      ...(typeof item.poster_path === "string" && /^\/[a-zA-Z0-9._-]+$/.test(item.poster_path) ? { imageUrl: `https://image.tmdb.org/t/p/w500${item.poster_path}` } : {}),
    }];
  });
}

export async function searchCatalog(query: string): Promise<CatalogTitle[]> {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) return [];
  const key = normalizeSearch(query);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.titles;
  const direct = await lookup(searchLookupTerm(query), token);
  let titles = direct;
  if (!direct.length) {
    const attempts = await Promise.allSettled(typoRetrievalQueries(query).map((value) => lookup(value, token)));
    if (attempts.length && attempts.every((attempt) => attempt.status === "rejected")) throw new Error("Typo search unavailable");
    titles = attempts.flatMap((attempt) => attempt.status === "fulfilled" ? attempt.value : [])
      .filter((item) => Math.min(searchMatchScore(item.title, query, item.year), searchMatchScore(item.originalTitle || item.title, query, item.year)) < 50)
      .map((item) => ({ ...item, corrected: true }));
  }
  const unique = [...new Map(titles.map((item) => [item.id, item])).values()]
    .sort((a, b) => Math.min(searchMatchScore(a.title, query, a.year), searchMatchScore(a.originalTitle || a.title, query, a.year)) - Math.min(searchMatchScore(b.title, query, b.year), searchMatchScore(b.originalTitle || b.title, query, b.year)))
    .slice(0, 6);
  cache.set(key, { expires: Date.now() + 300_000, titles: unique });
  while (cache.size > 100) cache.delete(cache.keys().next().value!);
  return unique;
}
