import { getRegionConfig } from "@/lib/regions";
import { normalizedService } from "@/lib/offer-priority";

const TMDB_API = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

type SignalKind = "watched" | "loved" | "not_for_me";
type TasteSignal = {
  signal?: SignalKind;
  title?: string;
  year?: number;
  mediaType?: "movie" | "show";
  tmdbId?: number;
  genres?: string[];
};
type TmdbTitle = {
  id?: number;
  title?: string;
  name?: string;
  media_type?: "movie" | "tv";
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  adult?: boolean;
};
type TmdbResponse = { results?: TmdbTitle[] };
type RankedTitle = { title: TmdbTitle; mediaType: "movie" | "show"; rank: number; reason: string };
type WatchProviders = { results?: Record<string, { flatrate?: Array<{ provider_name: string }> }> };

const movieGenres: Record<number, string> = {
  12: "Adventure", 14: "Fantasy", 16: "Animation", 18: "Drama", 27: "Horror", 28: "Action", 35: "Comedy", 36: "History", 37: "Western", 53: "Thriller", 80: "Crime", 99: "Documentary", 878: "Science fiction", 9648: "Mystery", 10402: "Music", 10749: "Romance", 10751: "Family", 10752: "War",
};
const tvGenres: Record<number, string> = {
  16: "Animation", 18: "Drama", 35: "Comedy", 37: "Western", 80: "Crime", 99: "Documentary", 9648: "Mystery", 10751: "Family", 10759: "Action & adventure", 10762: "Kids", 10763: "News", 10764: "Reality", 10765: "Sci-fi & fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & politics",
};

export async function POST(request: Request) {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) return Response.json({ error: "Personalized recommendations are not configured." }, { status: 503 });

  let body: { signals?: TasteSignal[]; preferredGenres?: string[]; services?: string[]; region?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: "The taste profile is invalid." }, { status: 400 });
  }
  const signals = (body.signals ?? []).filter(validSignal).slice(0, 24);
  const services = [...new Set((Array.isArray(body.services) ? body.services : [])
    .filter((service): service is string => typeof service === "string" && service.length <= 80)
    .map((service) => service.trim()).filter(Boolean))].slice(0, 20);
  const region = getRegionConfig(body.region).code;
  const knownGenres = new Map([...Object.values(movieGenres), ...Object.values(tvGenres)].map((genre) => [genre.toLowerCase(), genre]));
  const preferredGenres = [...new Set((body.preferredGenres ?? [])
    .filter((genre): genre is string => typeof genre === "string")
    .map((genre) => knownGenres.get(genre.toLowerCase()))
    .filter((genre): genre is string => Boolean(genre)))]
    .slice(0, 6);
  const positive = signals.filter((item) => item.signal === "loved" || item.signal === "watched").slice(0, 6);
  if (!positive.length && !preferredGenres.length) return Response.json({ section: null });

  try {
    if (!positive.length) {
      const movieIds = genreIds(movieGenres, preferredGenres);
      const tvIds = genreIds(tvGenres, preferredGenres);
      const [movies, shows] = await Promise.all([
        fetchTmdb("/discover/movie", token, { sort_by: "popularity.desc", include_adult: "false", ...(movieIds ? { with_genres: movieIds } : {}) }),
        fetchTmdb("/discover/tv", token, { sort_by: "popularity.desc", include_adult: "false", ...(tvIds ? { with_genres: tvIds } : {}) }),
      ]);
      const reason = `Because you like ${preferredGenres.slice(0, 2).join(" and ")}`;
      const candidates = [
        ...(movies.results ?? []).map((title) => ({ title, mediaType: "movie" as const })),
        ...(shows.results ?? []).map((title) => ({ title, mediaType: "show" as const })),
      ]
        .filter(({ title }) => title.id && title.poster_path && !title.adult)
        .map(({ title, mediaType }) => ({ title, mediaType, reason,
          rank: (title.vote_average ?? 0) + Math.log10((title.vote_count ?? 0) + 1) }))
        .sort((a, b) => b.rank - a.rank);
      const titles = await rankWithAccess(candidates, services, region, token);
      return Response.json({ section: titles.length ? { id: "personalized", kicker: "Shaped by your taste", title: "Picked for you", titles } : null }, { headers: { "Cache-Control": "private, max-age=300" } });
    }

    const resolved = (await Promise.all(positive.map(async (signal) => ({ ...signal, resolvedId: await resolveId(signal, token) })))).filter((item) => item.resolvedId);
    const batches = await Promise.all(resolved.slice(0, 4).map(async (seed) => {
      const endpoint = seed.mediaType === "show" ? "tv" : "movie";
      const response = await fetchTmdb(`/${endpoint}/${seed.resolvedId}/recommendations`, token);
      return { seed, results: response.results ?? [] };
    }));

    const excludedIds = new Set(signals.flatMap((signal) => signal.tmdbId ? [`${signal.mediaType}-${signal.tmdbId}`] : []));
    const excludedTitles = new Set(signals.map((signal) => signal.title?.toLowerCase()));
    const genreWeights = tasteWeights(signals, preferredGenres);
    const candidates = new Map<string, { title: TmdbTitle; mediaType: "movie" | "show"; rank: number; reason: string }>();

    for (const { seed, results } of batches) {
      for (const result of results) {
        const mediaType = result.media_type === "tv" ? "show" : result.media_type === "movie" ? "movie" : seed.mediaType;
        const title = (result.title || result.name)?.trim();
        if (!mediaType || !title || !result.id || !result.poster_path || result.adult || excludedIds.has(`${mediaType}-${result.id}`) || excludedTitles.has(title.toLowerCase())) continue;
        const genreMap = mediaType === "movie" ? movieGenres : tvGenres;
        const preference = (result.genre_ids ?? []).reduce((sum, id) => sum + (genreWeights.get(genreMap[id]?.toLowerCase()) ?? 0), 0);
        const seedWeight = seed.signal === "loved" ? 20 : 8;
        const rank = seedWeight + preference * 4 + (result.vote_average ?? 0) + Math.log10((result.vote_count ?? 0) + 1) * 3 + (result.popularity ?? 0) / 20;
        const key = `${mediaType}-${result.id}`;
        const existing = candidates.get(key);
        const reason = `${seed.signal === "loved" ? "Because you loved" : "Because you watched"} ${seed.title}`;
        if (existing) existing.rank += seedWeight / 2 + Math.max(0, preference);
        else candidates.set(key, { title: result, mediaType, rank, reason });
      }
    }

    const titles = await rankWithAccess([...candidates.values()], services, region, token);
    const lead = positive.find((item) => item.signal === "loved") ?? positive[0];
    return Response.json({
      section: titles.length ? {
        id: "personalized",
        kicker: "Shaped by your taste",
        title: lead?.signal === "loved" ? `Because you loved ${lead.title}` : "Picked for you",
        titles,
      } : null,
    }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch {
    return Response.json({ error: "Personalized recommendations are temporarily unavailable." }, { status: 502 });
  }
}

function validSignal(signal: TasteSignal) {
  return Boolean(signal && ["watched", "loved", "not_for_me"].includes(String(signal.signal)) && signal.title?.trim() && (signal.mediaType === "movie" || signal.mediaType === "show"));
}

async function resolveId(signal: TasteSignal, token: string) {
  if (Number.isSafeInteger(signal.tmdbId) && Number(signal.tmdbId) > 0) return Number(signal.tmdbId);
  const endpoint = signal.mediaType === "show" ? "tv" : "movie";
  const params: Record<string, string> = { query: String(signal.title), include_adult: "false" };
  if (signal.year) params[signal.mediaType === "show" ? "first_air_date_year" : "year"] = String(signal.year);
  const response = await fetchTmdb(`/search/${endpoint}`, token, params);
  return response.results?.[0]?.id;
}

async function fetchTmdb<T = TmdbResponse>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", "1");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` }, next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`TMDB returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function rankWithAccess(candidates: RankedTitle[], services: string[], region: string, token: string) {
  const shortlisted = candidates.sort((a, b) => b.rank - a.rank).slice(0, services.length ? 20 : 12);
  if (!services.length) return shortlisted.map(({ title, mediaType, reason }) => normalizeTitle(title, mediaType, reason));

  const checked = await Promise.all(shortlisted.map(async (candidate) => {
    let includedOn: string[] = [];
    try {
      const endpoint = candidate.mediaType === "show" ? "tv" : "movie";
      const providers = await fetchTmdb<WatchProviders>(`/${endpoint}/${candidate.title.id}/watch/providers`, token);
      const offered = new Set((providers.results?.[region]?.flatrate ?? []).map((provider) => normalizedService(provider.provider_name)));
      includedOn = services.filter((service) => offered.has(normalizedService(service)));
    } catch { /* Keep taste ranking if a provider check fails. */ }
    return { ...candidate, includedOn };
  }));

  return checked.sort((a, b) => {
    const accessDifference = Number(Boolean(b.includedOn.length)) - Number(Boolean(a.includedOn.length));
    if (accessDifference) return accessDifference;
    const rankDifference = b.rank - a.rank;
    if (Math.abs(rankDifference) > 2) return rankDifference;
    return (a.includedOn.length ? services.indexOf(a.includedOn[0]) : 99)
      - (b.includedOn.length ? services.indexOf(b.includedOn[0]) : 99) || rankDifference;
  })
    .slice(0, 12)
    .map(({ title, mediaType, reason, includedOn }) => normalizeTitle(title, mediaType,
      includedOn.length ? `${reason} · Included on ${includedOn.slice(0, 2).join(" and ")} in ${region}` : reason));
}

function tasteWeights(signals: TasteSignal[], preferredGenres: string[] = []) {
  const weights = new Map<string, number>();
  for (const genre of preferredGenres) weights.set(genre.toLowerCase(), 1.5);
  for (const signal of signals) {
    const value = signal.signal === "loved" ? 2 : signal.signal === "watched" ? 1 : -3;
    for (const genre of signal.genres ?? []) weights.set(genre.toLowerCase(), (weights.get(genre.toLowerCase()) ?? 0) + value);
  }
  return weights;
}

function genreIds(genreMap: Record<number, string>, genres: string[]) {
  const selected = new Set(genres.map((genre) => genre.toLowerCase()));
  return Object.entries(genreMap).filter(([, name]) => selected.has(name.toLowerCase())).map(([id]) => id).join(",");
}

function normalizeTitle(item: TmdbTitle, mediaType: "movie" | "show", reason: string) {
  const date = item.release_date || item.first_air_date;
  const genreMap = mediaType === "movie" ? movieGenres : tvGenres;
  return {
    id: item.id,
    title: item.title || item.name,
    year: date ? Number(date.slice(0, 4)) || undefined : undefined,
    mediaType,
    synopsis: item.overview?.trim() || "Details coming soon.",
    score: item.vote_average ? Math.round(item.vote_average * 10) : undefined,
    genres: (item.genre_ids ?? []).map((id) => genreMap[id]).filter(Boolean).slice(0, 2),
    posterUrl: imageUrl(item.poster_path, "w500"),
    backdropUrl: imageUrl(item.backdrop_path, "w780"),
    releaseDate: date,
    reason,
  };
}

function imageUrl(path?: string | null, size = "w500") {
  return path && /^\/[a-zA-Z0-9._-]+$/.test(path) ? `${IMAGE_BASE}/${size}${path}` : undefined;
}
