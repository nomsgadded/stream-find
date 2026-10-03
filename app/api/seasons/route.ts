const WATCHMODE_API = "https://api.watchmode.com/v1";

type OfferType = "included" | "free" | "rent" | "buy";

type WatchmodeEpisodeSource = {
  name?: string | null;
  region?: string | null;
  type?: string | null;
};

type WatchmodeEpisode = {
  episode_number?: number | null;
  season_number?: number | null;
  sources?: WatchmodeEpisodeSource[] | null;
};

type ProviderCoverage = {
  provider: string;
  type: OfferType;
  episodeCount: number;
};

type SeasonAccumulator = {
  seasonNumber: number;
  episodeNumbers: Set<number>;
  availableEpisodeNumbers: Set<number>;
  providers: Map<string, ProviderCoverage & { episodes: Set<number> }>;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const id = Number(requestUrl.searchParams.get("id"));
  const region = normalizeRegion(requestUrl.searchParams.get("region"));
  if (!Number.isSafeInteger(id) || id <= 0) {
    return Response.json({ error: "The selected title is invalid." }, { status: 400 });
  }

  const apiKey = process.env.WATCHMODE_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "Season availability is not configured." }, { status: 503 });
  }

  try {
    const url = new URL(`${WATCHMODE_API}/title/${id}/episodes/`);
    url.searchParams.set("apiKey", apiKey);
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return Response.json(
        { error: response.status === 429 ? "Season availability is busy. Try again shortly." : "Season availability is temporarily unavailable." },
        { status: response.status === 429 ? 429 : 502 },
      );
    }

    const episodes = await response.json() as WatchmodeEpisode[];
    const seasons = new Map<number, SeasonAccumulator>();

    for (const episode of episodes) {
      const seasonNumber = episode.season_number;
      const episodeNumber = episode.episode_number;
      if (!Number.isSafeInteger(seasonNumber) || Number(seasonNumber) <= 0 || !Number.isSafeInteger(episodeNumber) || Number(episodeNumber) <= 0) continue;

      const season = seasons.get(Number(seasonNumber)) ?? {
        seasonNumber: Number(seasonNumber),
        episodeNumbers: new Set<number>(),
        availableEpisodeNumbers: new Set<number>(),
        providers: new Map(),
      };
      season.episodeNumbers.add(Number(episodeNumber));

      for (const source of episode.sources ?? []) {
        if (source.region !== region) continue;
        const provider = normalizeProvider(source.name);
        const type = normalizeOfferType(source.type);
        if (!provider || !type) continue;

        season.availableEpisodeNumbers.add(Number(episodeNumber));
        const key = `${provider}|${type}`;
        const coverage = season.providers.get(key) ?? { provider, type, episodeCount: 0, episodes: new Set<number>() };
        coverage.episodes.add(Number(episodeNumber));
        coverage.episodeCount = coverage.episodes.size;
        season.providers.set(key, coverage);
      }

      seasons.set(season.seasonNumber, season);
    }

    const normalizedSeasons = [...seasons.values()]
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
      .map((season) => ({
        seasonNumber: season.seasonNumber,
        episodeCount: season.episodeNumbers.size,
        availableEpisodeCount: season.availableEpisodeNumbers.size,
        providers: [...season.providers.values()]
          .map(({ provider, type, episodeCount }) => ({ provider, type, episodeCount }))
          .sort((a, b) => offerRank(a.type) - offerRank(b.type) || b.episodeCount - a.episodeCount || a.provider.localeCompare(b.provider)),
      }));

    return Response.json(
      { seasons: normalizedSeasons, region },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return Response.json({ error: "Season availability is temporarily unavailable." }, { status: 502 });
  }
}

function normalizeRegion(value: string | null) {
  return value && /^[A-Z]{2}$/i.test(value) ? value.toUpperCase() : "US";
}

function normalizeOfferType(type?: string | null): OfferType | null {
  if (type === "sub") return "included";
  if (type === "free") return "free";
  if (type === "rent") return "rent";
  if (type === "buy") return "buy";
  return null;
}

function offerRank(type: OfferType) {
  return type === "included" ? 0 : type === "free" ? 1 : type === "rent" ? 2 : 3;
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
