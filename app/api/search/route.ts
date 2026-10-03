import { getRegionConfig } from "@/lib/regions";
import { groupTitleRecords, mergeTitleRecords, sameTitle } from "@/lib/title-records";
import { normalizeSearch, parseSearch, searchMatchScore } from "@/lib/search-matching";
import { rememberSearchAvailability } from "@/lib/search-availability";
import { searchCatalog, type CatalogTitle } from "@/lib/search-catalog";
import { catalogProviderOffers, mergeProviderOffers } from "@/lib/search-providers";

const WATCHMODE_API = "https://api.watchmode.com/v1";
const PAGE_SIZE = 12;
type SearchResult = NonNullable<Awaited<ReturnType<typeof fetchDetails>>> | Awaited<ReturnType<typeof resolveCatalogTitle>>;

type OfferType = "included" | "free" | "rent" | "buy";

type WatchmodeSearchResult = {
  id?: number;
  name?: string;
  result_type?: string;
  year?: number;
  type?: string;
  tmdb_id?: number;
  imdb_id?: string;
};

type WatchmodeSearchResponse = {
  title_results?: WatchmodeSearchResult[];
};

type WatchmodeSource = {
  format?: string | null;
  name?: string | null;
  price?: number | string | null;
  region?: string | null;
  type?: string | null;
  web_url?: string | null;
};

type WatchmodeDetails = {
  tmdb_id?: number;
  imdb_id?: string;
  backdrop?: string | null;
  critic_score?: number | null;
  genre_names?: string[] | null;
  id?: number;
  plot_overview?: string | null;
  popularity_percentile?: number | null;
  poster?: string | null;
  posterLarge?: string | null;
  posterMedium?: string | null;
  release_date?: string | null;
  runtime_minutes?: number | null;
  sources?: WatchmodeSource[] | null;
  network_names?: string[] | null;
  review_summary?: string | null;
  similar_titles?: number[] | null;
  title?: string | null;
  trailer?: string | null;
  trailer_thumbnail?: string | null;
  type?: string | null;
  us_rating?: string | null;
  user_rating?: number | null;
  will_you_like_this?: string | null;
  year?: number | null;
};

type LiveOffer = {
  provider: string;
  type: OfferType;
  price?: number;
  currency?: string;
  quality: "HD" | "4K";
  url?: string;
};

const artClasses = [
  "posterGlass",
  "posterNorth",
  "posterHours",
  "posterSignal",
  "posterPaper",
  "posterMarlowe",
  "posterAfterlight",
];

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const query = requestUrl.searchParams.get("q")?.trim() ?? "";
  const idValue = requestUrl.searchParams.get("id");
  const requestedId = idValue ? Number(idValue) : null;
  const region = getRegionConfig(requestUrl.searchParams.get("region"));
  const page = Number(requestUrl.searchParams.get("page") ?? "1");

  if (!Number.isSafeInteger(page) || page < 1) return Response.json({ error: "Invalid results page." }, { status: 400 });

  if (idValue && (!Number.isSafeInteger(requestedId) || Number(requestedId) <= 0)) {
    return Response.json({ error: "The selected title is invalid." }, { status: 400 });
  }

  if ((!requestedId && query.length < 2) || query.length > 80) {
    return Response.json(
      { error: "Enter between 2 and 80 characters." },
      { status: 400 },
    );
  }

  const apiKey = process.env.WATCHMODE_API_KEY;
  if (typeof apiKey !== "string" || !apiKey) {
    return Response.json(
      { error: "Live availability is not configured." },
      { status: 503 },
    );
  }

  try {
    let nextPage: number | null = null;
    let titles: SearchResult[];
    if (requestedId) {
      const selected = await fetchDetails(requestedId, apiKey, region.code, region.currency);
      if (!selected) throw new Error("502");
      titles = [selected];
      if (selected && (!selected.offers.length || !selected.posterUrl || selected.synopsis === "Synopsis unavailable.")) {
        const peers = await findMatches(selected.title, apiKey).catch(() => []);
        const peerIds = peers.filter((peer) => peer.id !== requestedId && sameTitle(peer, selected)).map((peer) => peer.id);
        const related = await Promise.allSettled(peerIds.map((id) => fetchDetails(id, apiKey, region.code, region.currency)));
        titles = mergeTitleRecords([...titles, ...related.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])]);
      }
    } else {
      const [watchmode, catalog] = await Promise.allSettled([findMatches(query, apiKey), searchCatalog(query)]);
      const extra = catalog.status === "fulfilled" ? catalog.value : [];
      if (watchmode.status === "rejected" && !extra.length) throw watchmode.reason;
      const candidates = [...(watchmode.status === "fulfilled" ? watchmode.value : []), ...extra];
      const groups = groupTitleRecords(candidates).sort((a, b) => searchMatchScore(a[0].title, query, a[0].year) - searchMatchScore(b[0].title, query, b[0].year));
      const pageGroups = groups.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      const details = await Promise.allSettled(pageGroups.flatMap<Promise<SearchResult | null>>((group) => {
        const known = group.filter((item) => item.id > 0);
        return known.length ? known.map((item) => fetchDetails(item.id, apiKey, region.code, region.currency))
          : [resolveCatalogTitle(group[0] as CatalogTitle, apiKey, region.code, region.currency)];
      }));
      titles = mergeTitleRecords(details.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []));
      if (pageGroups.length && !titles.length) throw new Error("502");
      nextPage = page * PAGE_SIZE < groups.length ? page + 1 : null;
    }

    for (const title of titles) {
      const ids = [...((title as { watchmodeIds?: number[] }).watchmodeIds ?? (title.watchmodeId ? [title.watchmodeId] : []))];
      if (title.tmdbId && (!("availabilityKnown" in title) || title.availabilityKnown !== false)) ids.push(-(title.mediaType === "movie" ? 1_000_000_000 : 2_000_000_000) - title.tmdbId);
      rememberSearchAvailability(ids, region.code, title.offers);
    }
    return Response.json(
      {
        attribution: {
          label: "Availability data by Watchmode",
          url: "https://api.watchmode.com/",
        },
        query,
        region: region.code,
        titles,
        nextPage,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch (error) {
    return upstreamError(error instanceof Error && /^\d{3}$/.test(error.message) ? Number(error.message) : 502);
  }
}

async function resolveCatalogTitle(item: CatalogTitle, apiKey: string, region: string, currency: string) {
  try {
    const url = new URL(`${WATCHMODE_API}/search/`);
    url.searchParams.set("search_field", item.mediaType === "movie" ? "tmdb_movie_id" : "tmdb_tv_id");
    url.searchParams.set("search_value", String(item.tmdbId));
    const response = await fetch(url, { headers: { "X-API-Key": apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (response.ok) {
      const data = await response.json() as WatchmodeSearchResponse;
      const matched = data.title_results?.find((title) => Number.isSafeInteger(title.id) && title.id! > 0
        && (!title.tmdb_id || title.tmdb_id === item.tmdbId)
        && (title.type?.includes("movie") ? "movie" : "show") === item.mediaType);
      if (matched?.id) {
        const details = await fetchDetails(matched.id, apiKey, region, currency);
        if (details) return { ...details, corrected: item.corrected };
      }
    }
  } catch { /* Keep the metadata result when availability cannot be verified. */ }
  const providers = await catalogProviderOffers(item.tmdbId, item.mediaType, region);
  return { id: -1_000_000_000 - item.tmdbId, title: item.title, year: item.year ?? 0, mediaType: item.mediaType,
    tmdbId: item.tmdbId, watchmodeId: undefined, art: "posterPaper", genres: [], offers: providers ?? [],
    synopsis: item.synopsis, posterUrl: item.imageUrl, backdropUrl: item.imageUrl,
    runtime: item.mediaType === "movie" ? "Film" : "TV series", score: item.score, rating: "NR",
    live: true, region, availabilityKnown: providers !== undefined, corrected: item.corrected,
  };
}

async function findMatches(query: string, apiKey: string) {
  const searchUrl = new URL(`${WATCHMODE_API}/search/`);
  searchUrl.searchParams.set("search_field", "name");
  searchUrl.searchParams.set("search_value", parseSearch(query).term || normalizeSearch(query));
  const partialUrl = new URL(`${WATCHMODE_API}/autocomplete-search/`);
  partialUrl.searchParams.set("search_value", parseSearch(query).term || normalizeSearch(query));
  partialUrl.searchParams.set("search_type", "2");
  const responses = await Promise.allSettled([searchUrl, partialUrl].map(async (url) => {
    const response = await fetch(url, { headers: { Accept: "application/json", "X-API-Key": apiKey }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json() as WatchmodeSearchResponse & { results?: WatchmodeSearchResult[] };
    return data.title_results ?? (data.results ?? []).filter((item) => !item.result_type || item.result_type === "title");
  }));
  if (responses.every((result) => result.status === "rejected")) throw responses[0].reason;
  const matches = responses.flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter((item) => typeof item.name === "string" && (!item.result_type || item.result_type === "title"))
    .flatMap((item) => typeof item.id === "number" && Number.isSafeInteger(item.id) && item.id > 0 ? [{
      id: item.id, title: item.name!, year: item.year,
      mediaType: item.type?.includes("movie") ? "movie" as const : "show" as const,
      ...(item.tmdb_id ? { tmdbId: item.tmdb_id } : {}),
      ...(item.imdb_id ? { imdbId: item.imdb_id } : {}),
    }] : []);
  return [...new Map(matches.map((item) => [item.id, item])).values()]
    .sort((a, b) => searchMatchScore(a.title, query, a.year) - searchMatchScore(b.title, query, b.year));
}

async function fetchDetails(id: number, apiKey: string, region: string, currency: string) {
  const detailsUrl = new URL(`${WATCHMODE_API}/title/${id}/details/`);
  detailsUrl.searchParams.set("append_to_response", "sources");
  detailsUrl.searchParams.set("regions", region);

  const response = await fetch(detailsUrl, {
    headers: { Accept: "application/json", "X-API-Key": apiKey },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;

  const details = await response.json() as WatchmodeDetails;
  const title = details.title?.trim();
  const watchmodeId = details.id ?? id;
  if (!title) return null;

  const offers = normalizeOffers(details.sources ?? [], region, currency);

  const mediaType: "movie" | "show" = details.type?.includes("movie") ? "movie" : "show";
  const supplemental = details.tmdb_id ? await catalogProviderOffers(details.tmdb_id, mediaType, region) : undefined;
  const score = normalizeScore(details.critic_score, details.user_rating);
  const parsedYear = Number(details.release_date?.slice(0, 4));
  const year = details.year
    ?? (parsedYear || new Date().getUTCFullYear());
  const posterUrl = safeUrl(details.posterLarge)
    ?? safeUrl(details.posterMedium)
    ?? safeUrl(details.poster);
  const backdropUrl = safeUrl(details.backdrop) ?? posterUrl;
  const trailerUrl = safeUrl(details.trailer);
  const trailerThumbnailUrl = safeUrl(details.trailer_thumbnail);

  return {
    art: artClasses[Math.abs(watchmodeId) % artClasses.length],
    ...(backdropUrl ? { backdropUrl } : {}),
    genres: (details.genre_names ?? []).slice(0, 3),
    id: -Math.abs(watchmodeId),
    live: true,
    mediaType,
    networkNames: (details.network_names ?? []).slice(0, 3),
    offers: mergeProviderOffers(offers, supplemental ?? []),
    ...(typeof details.popularity_percentile === "number" ? { popularityPercentile: Math.round(details.popularity_percentile) } : {}),
    rating: details.us_rating || "NR",
    region,
    ...(details.release_date ? { releaseDate: details.release_date.slice(0, 10) } : {}),
    ...(details.review_summary?.trim() ? { reviewSummary: details.review_summary.trim() } : {}),
    runtime: formatRuntime(details.runtime_minutes, mediaType),
    score,
    similarTitleIds: (details.similar_titles ?? []).filter((value) => Number.isSafeInteger(value) && value > 0).slice(0, 6),
    synopsis: details.plot_overview?.trim() || "Synopsis unavailable.",
    title,
    ...(trailerUrl ? { trailerUrl } : {}),
    ...(trailerThumbnailUrl ? { trailerThumbnailUrl } : {}),
    ...(posterUrl ? { posterUrl } : {}),
    watchmodeId,
    ...(details.tmdb_id ? { tmdbId: details.tmdb_id } : {}),
    ...(details.imdb_id ? { imdbId: details.imdb_id } : {}),
    ...(details.will_you_like_this?.trim() ? { willYouLikeThis: details.will_you_like_this.trim() } : {}),
    year,
  };
}

function normalizeOffers(sources: WatchmodeSource[], region: string, currency: string): LiveOffer[] {
  const offers = new Map<string, LiveOffer>();

  for (const source of sources) {
    if (source.region && source.region !== region) continue;
    const type = normalizeOfferType(source.type);
    const provider = normalizeProvider(source.name);
    if (!type || !provider) continue;

    const numericPrice = Number(source.price);
    const price = Number.isFinite(numericPrice) && numericPrice > 0
      ? numericPrice
      : undefined;
    const quality = source.format?.toLowerCase().includes("4k") ? "4K" : "HD";
    const url = safeUrl(source.web_url);
    const key = `${provider}|${type}|${price ?? ""}`;

    if (!offers.has(key)) {
      offers.set(key, {
        provider,
        type,
        ...(price ? { price } : {}),
        ...(price ? { currency } : {}),
        quality,
        ...(url ? { url } : {}),
      });
    }
  }

  return [...offers.values()]
    .sort((a, b) => offerRank(a.type) - offerRank(b.type) || (a.price ?? 0) - (b.price ?? 0))
    .slice(0, 12);
}

function normalizeOfferType(type?: string | null): OfferType | null {
  if (type === "sub") return "included";
  if (type === "free") return "free";
  if (type === "rent") return "rent";
  if (type === "buy") return "buy";
  return null;
}

function normalizeProvider(name?: string | null) {
  if (!name) return null;
  const normalized = name.trim();
  const aliases: Record<string, string> = {
    "Amazon Prime": "Prime Video",
    "Amazon Prime Video": "Prime Video",
    "Amazon Video": "Prime Video",
    "AppleTV": "Apple TV",
    "AppleTV+": "Apple TV+",
    "Google Play": "Google TV",
    "Google Play Movies": "Google TV",
    "HBO MAX": "HBO Max",
    "Max": "HBO Max",
    "Netflix Basic with Ads": "Netflix",
    "Paramount Plus": "Paramount+",
    "Tubi TV": "Tubi",
    "The Roku Channel": "Roku Channel",
    "Viki": "Rakuten Viki",
    "Viki Pass": "Rakuten Viki",
    "Youtube TV": "YouTube TV",
    "YouTubeTV": "YouTube TV",
    "iTunes": "Apple TV",
  };
  return aliases[normalized] ?? normalized;
}

function normalizeScore(criticScore?: number | null, userRating?: number | null) {
  if (typeof criticScore === "number" && criticScore > 0) {
    return Math.min(100, Math.round(criticScore));
  }
  if (typeof userRating === "number" && userRating > 0) {
    return Math.min(100, Math.round(userRating * 10));
  }
  return 0;
}

function formatRuntime(minutes: number | null | undefined, mediaType: "movie" | "show") {
  if (!minutes || minutes <= 0) return mediaType === "movie" ? "Film" : "TV series";
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours}h ${remaining.toString().padStart(2, "0")}m` : `${remaining}m`;
}

function safeUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function offerRank(type: OfferType) {
  return type === "included" ? 0 : type === "free" ? 1 : type === "rent" ? 2 : 3;
}

function upstreamError(status: number) {
  const message = status === 401 || status === 403
    ? "The live-data connection needs attention."
    : status === 429
      ? "The monthly live-search limit has been reached."
      : "Live availability is temporarily unavailable.";
  return Response.json({ error: message }, { status: status === 429 ? 429 : 502 });
}
