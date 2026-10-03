import { getRegionConfig } from "@/lib/regions";

const TMDB_API = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

type TmdbCredit = {
  id?: number;
  name?: string;
  character?: string;
  job?: string;
  known_for_department?: string;
  profile_path?: string | null;
};

type TmdbProvider = { provider_id?: number; provider_name?: string; logo_path?: string | null };

type TmdbDetails = {
  id?: number;
  title?: string;
  name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  vote_average?: number;
  genres?: Array<{ name?: string }>;
  backdrop_path?: string | null;
  poster_path?: string | null;
  status?: string;
  networks?: Array<{ name?: string }>;
  created_by?: TmdbCredit[];
  credits?: { cast?: TmdbCredit[]; crew?: TmdbCredit[] };
  videos?: { results?: Array<{ key?: string; name?: string; official?: boolean; site?: string; type?: string }> };
  seasons?: Array<{ id?: number; season_number?: number; episode_count?: number; name?: string; air_date?: string | null; poster_path?: string | null }>;
};

type TmdbProviderResponse = {
  results?: Record<string, { link?: string; flatrate?: TmdbProvider[]; free?: TmdbProvider[]; ads?: TmdbProvider[]; rent?: TmdbProvider[]; buy?: TmdbProvider[] }>;
};

type TmdbSimilarResponse = {
  results?: Array<{
    id?: number;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    poster_path?: string | null;
    backdrop_path?: string | null;
  }>;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = Number(url.searchParams.get("id"));
  const mediaType = url.searchParams.get("type") === "show" ? "show" : "movie";
  const region = getRegionConfig(url.searchParams.get("region"));
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "The selected title is invalid." }, { status: 400 });

  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) return Response.json({ error: "Title details are not configured." }, { status: 503 });

  try {
    const endpointType = mediaType === "show" ? "tv" : "movie";
    if (url.searchParams.get("section") === "similar") {
      const similar = await fetchTmdb<TmdbSimilarResponse>(`/${endpointType}/${id}/similar`, token);
      return Response.json({ similar: normalizeSimilar(similar, mediaType) }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
    }
    const [details, providers] = await Promise.all([
      fetchTmdb<TmdbDetails>(`/${endpointType}/${id}`, token, { append_to_response: "credits,videos" }),
      fetchTmdb<TmdbProviderResponse>(`/${endpointType}/${id}/watch/providers`, token),
    ]);
    const title = details.title?.trim() || details.name?.trim();
    if (!title) return Response.json({ error: "That title could not be found." }, { status: 404 });

    const date = details.release_date || details.first_air_date || "";
    const regionalProviders = providers.results?.[region.code];
    const providerLink = regionalProviders?.link;
    const offers = [
      ...providerOffers(regionalProviders?.flatrate, "included", providerLink),
      ...providerOffers(regionalProviders?.free ?? regionalProviders?.ads, "free", providerLink),
      ...providerOffers(regionalProviders?.rent, "rent", providerLink),
      ...providerOffers(regionalProviders?.buy, "buy", providerLink),
    ];
    const trailer = details.videos?.results?.find((video) => video.site === "YouTube" && video.type === "Trailer" && video.official)
      ?? details.videos?.results?.find((video) => video.site === "YouTube" && video.type === "Trailer");
    const cast = (details.credits?.cast ?? []).slice(0, 12).map((credit) => normalizeCredit(credit, "cast" as const));
    const crewSource = [
      ...(details.created_by ?? []).map((credit) => ({ ...credit, job: "Creator" })),
      ...(details.credits?.crew ?? []).filter((credit) => /director|creator|writer|screenplay/i.test(credit.job ?? "")),
    ];
    const crew = [...new Map(crewSource.map((credit) => [`${credit.id}-${credit.job}`, credit])).values()]
      .slice(0, 6)
      .map((credit) => normalizeCredit(credit, "crew" as const));

    return Response.json({
      title: {
        id: -1_000_000_000 - id,
        title,
        year: Number(date.slice(0, 4)) || new Date().getUTCFullYear(),
        mediaType,
        runtime: mediaType === "movie"
          ? formatRuntime(details.runtime)
          : details.episode_run_time?.[0] ? `${details.episode_run_time[0]}m episodes` : "Series",
        score: details.vote_average ? Math.round(details.vote_average * 10) : 0,
        rating: "NR",
        genres: (details.genres ?? []).flatMap((genre) => genre.name ? [genre.name] : []).slice(0, 4),
        synopsis: details.overview?.trim() || "Synopsis unavailable.",
        art: "posterPaper",
        backdropUrl: imageUrl(details.backdrop_path, "original"),
        posterUrl: imageUrl(details.poster_path, "w500"),
        offers,
        live: true,
        region: region.code,
        releaseDate: date ? date.slice(0, 10) : undefined,
        tmdbId: id,
        networkNames: (details.networks ?? []).flatMap((network) => network.name ? [network.name] : []).slice(0, 3),
        trailerUrl: trailer?.key ? `https://www.youtube.com/watch?v=${trailer.key}` : undefined,
        status: details.status,
      },
      credits: [...cast, ...crew],
      seasons: (details.seasons ?? [])
        .filter((season) => (season.season_number ?? 0) > 0)
        .map((season) => ({
          seasonNumber: season.season_number,
          episodeCount: season.episode_count ?? 0,
          name: season.name || `Season ${season.season_number}`,
          airDate: season.air_date,
          posterUrl: imageUrl(season.poster_path, "w342"),
        })),
      attribution: { label: "Metadata by TMDB", url: "https://www.themoviedb.org/" },
    }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ error: "Title details are temporarily unavailable." }, { status: 502 });
  }
}

function normalizeSimilar(similar: TmdbSimilarResponse, mediaType: "movie" | "show") {
  return (similar.results ?? []).filter((item) => item.id && (item.title || item.name)).slice(0, 6).map((item) => ({
    source: "tmdb",
    tmdbId: item.id,
    title: item.title || item.name,
    year: Number((item.release_date || item.first_air_date || "").slice(0, 4)) || new Date().getUTCFullYear(),
    mediaType,
    score: item.vote_average ? Math.round(item.vote_average * 10) : 0,
    posterUrl: imageUrl(item.poster_path, "w342"),
    backdropUrl: imageUrl(item.backdrop_path, "w780"),
  }));
}

async function fetchTmdb<T>(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`TMDB returned ${response.status}`);
  return response.json() as Promise<T>;
}

function normalizeCredit(credit: TmdbCredit, type: "cast" | "crew") {
  return {
    personId: credit.id ?? 0,
    name: credit.name || "Unknown",
    role: type === "cast" ? credit.character || "Cast" : credit.job || credit.known_for_department || "Creator",
    type,
    photoUrl: imageUrl(credit.profile_path, "w185"),
  };
}

function providerOffers(providers: TmdbProvider[] | undefined, type: "included" | "free" | "rent" | "buy", link?: string) {
  return (providers ?? []).flatMap((provider) => provider.provider_name ? [{
    provider: provider.provider_name,
    providerLogoUrl: imageUrl(provider.logo_path, "w92"),
    type,
    quality: "HD" as const,
    ...(link ? { url: link } : {}),
  }] : []);
}

function imageUrl(path?: string | null, size = "w500") {
  return path && /^\/[a-zA-Z0-9._-]+$/.test(path) ? `${IMAGE_BASE}/${size}${path}` : undefined;
}

function formatRuntime(minutes?: number) {
  if (!minutes) return "Runtime unavailable";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}
