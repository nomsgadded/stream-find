import { getRegionConfig } from "@/lib/regions";

const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

type MediaType = "movie" | "show";
type DiscoverySectionId = "trending" | "upcoming" | "airing" | "included";

type TmdbTitle = {
  backdrop_path?: string | null;
  first_air_date?: string | null;
  genre_ids?: number[];
  id?: number;
  media_type?: "movie" | "tv" | "person";
  name?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  release_date?: string | null;
  title?: string | null;
  vote_average?: number | null;
};

type TmdbListResponse = {
  results?: TmdbTitle[];
};

type DiscoveryTitle = {
  id: number;
  title: string;
  year?: number;
  mediaType: MediaType;
  synopsis: string;
  score?: number;
  genres: string[];
  posterUrl?: string;
  backdropUrl?: string;
  releaseDate?: string;
};

type DiscoverySection = {
  id: DiscoverySectionId;
  kicker: string;
  title: string;
  titles: DiscoveryTitle[];
};

const movieGenres: Record<number, string> = {
  12: "Adventure", 14: "Fantasy", 16: "Animation", 18: "Drama", 27: "Horror",
  28: "Action", 35: "Comedy", 36: "History", 37: "Western", 53: "Thriller",
  80: "Crime", 99: "Documentary", 878: "Science fiction", 9648: "Mystery",
  10402: "Music", 10749: "Romance", 10751: "Family", 10752: "War",
};

const tvGenres: Record<number, string> = {
  16: "Animation", 18: "Drama", 35: "Comedy", 37: "Western", 80: "Crime",
  99: "Documentary", 9648: "Mystery", 10751: "Family", 10759: "Action & adventure",
  10762: "Kids", 10763: "News", 10764: "Reality", 10765: "Sci-fi & fantasy",
  10766: "Soap", 10767: "Talk", 10768: "War & politics",
};

export async function GET(request: Request) {
  const region = getRegionConfig(new URL(request.url).searchParams.get("region"));
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) {
    return Response.json({ error: "Live discovery is not configured." }, { status: 503 });
  }

  try {
    const services = (new URL(request.url).searchParams.get("services") ?? "").split("|").filter(Boolean).slice(0, 20);
    const included: DiscoveryTitle[] = [];
    if (services.length) try {
      const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^hbomax$/, "max").replace(/^amazonprimevideo$/, "primevideo");
      const directory = await fetchTmdb("/watch/providers/movie", token, { watch_region: region.code }) as { results?: Array<{ provider_id: number; provider_name: string }> };
      const selected = new Set(services.map(normalize));
      const providerIds = (directory.results ?? []).filter((item) => selected.has(normalize(item.provider_name))).map((item) => item.provider_id);
      if (providerIds.length) {
        const params = { watch_region: region.code, with_watch_providers: providerIds.join("|"), with_watch_monetization_types: "flatrate", sort_by: "popularity.desc", include_adult: "false" };
        const [movies, shows] = await Promise.all([fetchTmdb("/discover/movie", token, params), fetchTmdb("/discover/tv", token, params)]);
        const movieTitles = normalizeTitles(movies.results, "movie", 6);
        const showTitles = normalizeTitles(shows.results, "show", 6);
        for (let index = 0; index < 6; index++) {
          if (movieTitles[index]) included.push(movieTitles[index]);
          if (showTitles[index]) included.push(showTitles[index]);
        }
      }
    } catch { /* General discovery remains available if provider discovery fails. */ }
    const [trending, upcoming, airing] = await Promise.all([
      fetchTmdb("/trending/all/week", token),
      fetchTmdb("/movie/upcoming", token, { region: region.code }),
      fetchTmdb("/tv/airing_today", token, { timezone: region.timezone }),
    ]);

    const allSections: DiscoverySection[] = [
      ...(included.length ? [{ id: "included" as const, kicker: "Your services", title: "Included with your services", titles: included }] : []),
      {
        id: "trending",
        kicker: "What everyone is watching",
        title: "Trending this week",
        titles: normalizeTitles(trending.results, undefined, 10),
      },
      {
        id: "upcoming",
        kicker: "Plan your next movie night",
        title: "Coming soon",
        titles: normalizeTitles(upcoming.results, "movie", 10),
      },
      {
        id: "airing",
        kicker: "Fresh episodes",
        title: "Airing today",
        titles: normalizeTitles(airing.results, "show", 10),
      },
    ];
    const sections = allSections.filter((section) => section.titles.length > 0);

    return Response.json(
      {
        sections,
        region: region.code,
        attribution: {
          label: "Metadata and artwork by TMDB",
          url: "https://www.themoviedb.org/",
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600",
        },
      },
    );
  } catch {
    return Response.json({ error: "Live discovery is temporarily unavailable." }, { status: 502 });
  }
}

async function fetchTmdb(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("page", "1");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`TMDB request failed with ${response.status}`);
  return response.json() as Promise<TmdbListResponse>;
}

function normalizeTitles(results: TmdbTitle[] | undefined, fallbackType?: MediaType, limit = 10): DiscoveryTitle[] {
  return (results ?? [])
    .flatMap((result) => {
      const mediaType = fallbackType ?? (result.media_type === "movie" ? "movie" : result.media_type === "tv" ? "show" : undefined);
      const title = (result.title ?? result.name)?.trim();
      if (!mediaType || !title || typeof result.id !== "number" || !result.poster_path) return [];

      const date = result.release_date ?? result.first_air_date;
      const year = date ? Number(date.slice(0, 4)) : undefined;
      const genreMap = mediaType === "movie" ? movieGenres : tvGenres;
      const score = typeof result.vote_average === "number" && result.vote_average > 0
        ? Math.round(result.vote_average * 10)
        : undefined;

      return [{
        id: result.id,
        title,
        ...(Number.isSafeInteger(year) ? { year } : {}),
        mediaType,
        synopsis: result.overview?.trim() || "Details coming soon.",
        ...(score ? { score } : {}),
        genres: (result.genre_ids ?? []).map((id) => genreMap[id]).filter(Boolean).slice(0, 2),
        posterUrl: imageUrl(result.poster_path, "w500"),
        ...(result.backdrop_path ? { backdropUrl: imageUrl(result.backdrop_path, "w780") } : {}),
        ...(date ? { releaseDate: date } : {}),
      }];
    })
    .slice(0, limit);
}

function imageUrl(path: string, size: "w500" | "w780") {
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}
