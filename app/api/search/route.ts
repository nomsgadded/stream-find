import { getRegionConfig } from "@/lib/regions";

const WATCHMODE_API = "https://api.watchmode.com/v1";
const MAX_RESULTS = 6;

type OfferType = "included" | "free" | "rent" | "buy";

type WatchmodeSearchResult = {
  id?: number;
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

  if (idValue && (!Number.isSafeInteger(requestedId) || Number(requestedId) <= 0)) {
    return Response.json({ error: "The selected title is invalid." }, { status: 400 });
  }

  if (query.length < 2 || query.length > 80) {
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
    let titleIds: number[];
    if (requestedId) {
      titleIds = [requestedId];
    } else {
      const searchUrl = new URL(`${WATCHMODE_API}/search/`);
      searchUrl.searchParams.set("apiKey", apiKey);
      searchUrl.searchParams.set("search_field", "name");
      searchUrl.searchParams.set("search_value", query);

      const searchResponse = await fetch(searchUrl, {
        headers: { Accept: "application/json" },
      });

      if (!searchResponse.ok) return upstreamError(searchResponse.status);

      const searchData = await searchResponse.json() as WatchmodeSearchResponse;
      titleIds = (searchData.title_results ?? [])
        .map((result) => result.id)
        .filter((id): id is number => typeof id === "number")
        .slice(0, MAX_RESULTS);
    }

    const detailResults = await Promise.allSettled(
      titleIds.map((id) => fetchDetails(id, apiKey, region.code, region.currency)),
    );

    const titles = detailResults
      .flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);

    return Response.json(
      {
        attribution: {
          label: "Availability data by Watchmode",
          url: "https://api.watchmode.com/",
        },
        query,
        region: region.code,
        titles,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    );
  } catch {
    return Response.json(
      { error: "Live availability is temporarily unavailable." },
      { status: 502 },
    );
  }
}

async function fetchDetails(id: number, apiKey: string, region: string, currency: string) {
  const detailsUrl = new URL(`${WATCHMODE_API}/title/${id}/details/`);
  detailsUrl.searchParams.set("apiKey", apiKey);
  detailsUrl.searchParams.set("append_to_response", "sources");
  detailsUrl.searchParams.set("regions", region);

  const response = await fetch(detailsUrl, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) return null;

  const details = await response.json() as WatchmodeDetails;
  const title = details.title?.trim();
  const watchmodeId = details.id ?? id;
  if (!title) return null;

  const offers = normalizeOffers(details.sources ?? [], region, currency);
  if (!offers.length) return null;

  const mediaType = details.type?.includes("movie") ? "movie" : "show";
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
    offers,
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
