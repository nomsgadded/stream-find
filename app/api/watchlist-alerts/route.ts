import { getRegionConfig } from "@/lib/regions";

const TMDB_API = "https://api.themoviedb.org/3";
const MAX_TITLES = 12;

type MediaType = "movie" | "show";

type WatchlistInput = {
  id: number;
  title: string;
  year?: number;
  mediaType: MediaType;
  tmdbId?: number;
};

type TmdbSearchResult = {
  id?: number;
  name?: string;
  title?: string;
  first_air_date?: string | null;
  release_date?: string | null;
};

type TmdbSearchResponse = { results?: TmdbSearchResult[] };

type TvEpisode = {
  air_date?: string | null;
  episode_number?: number;
  name?: string | null;
  season_number?: number;
};

type TvDetails = {
  next_episode_to_air?: TvEpisode | null;
  last_episode_to_air?: TvEpisode | null;
  status?: string | null;
};

type MovieRelease = {
  release_date?: string | null;
  type?: number;
};

type MovieReleaseDates = {
  results?: Array<{ iso_3166_1?: string; release_dates?: MovieRelease[] }>;
};

type ReleaseAlert = {
  titleId: number;
  title: string;
  kind: "upcoming_episode" | "recent_episode" | "movie_release" | "recent_release";
  date: string;
  label: string;
  detail: string;
};

export async function POST(request: Request) {
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) return Response.json({ error: "Release tracking is not configured." }, { status: 503 });

  let body: { titles?: WatchlistInput[]; region?: string };
  try {
    body = await request.json() as { titles?: WatchlistInput[]; region?: string };
  } catch {
    return Response.json({ error: "The watchlist request is invalid." }, { status: 400 });
  }

  const region = getRegionConfig(body.region);
  const titles = (body.titles ?? [])
    .filter((title) => Number.isSafeInteger(title.id) && typeof title.title === "string" && title.title.trim().length > 0 && (title.mediaType === "movie" || title.mediaType === "show"))
    .slice(0, MAX_TITLES);

  if (!titles.length) return Response.json({ alerts: [], checked: 0, region: region.code });

  try {
    const results = await Promise.allSettled(titles.map((title) => findReleaseAlert(title, token, region.code)));
    const alerts = results
      .flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])
      .sort((a, b) => a.date.localeCompare(b.date));

    return Response.json({ alerts, checked: titles.length, region: region.code }, {
      headers: { "Cache-Control": "private, max-age=0" },
    });
  } catch {
    return Response.json({ error: "Release tracking is temporarily unavailable." }, { status: 502 });
  }
}

async function findReleaseAlert(title: WatchlistInput, token: string, region: string): Promise<ReleaseAlert | null> {
  const tmdbId = title.tmdbId ?? await findTmdbId(title, token, region);
  if (!tmdbId) return null;

  if (title.mediaType === "show") {
    const details = await fetchTmdb<TvDetails>(`/tv/${tmdbId}`, token);
    const nextEpisode = details.next_episode_to_air;
    if (nextEpisode?.air_date && isWithinWindow(nextEpisode.air_date, 0, 180)) {
      return {
        titleId: title.id,
        title: title.title,
        kind: "upcoming_episode",
        date: nextEpisode.air_date,
        label: "New episode",
        detail: episodeLabel(nextEpisode, "airs"),
      };
    }

    const lastEpisode = details.last_episode_to_air;
    if (lastEpisode?.air_date && isWithinWindow(lastEpisode.air_date, -14, -1)) {
      return {
        titleId: title.id,
        title: title.title,
        kind: "recent_episode",
        date: lastEpisode.air_date,
        label: "Recently aired",
        detail: episodeLabel(lastEpisode, "aired"),
      };
    }
    return null;
  }

  const releaseData = await fetchTmdb<MovieReleaseDates>(`/movie/${tmdbId}/release_dates`, token);
  const regional = releaseData.results?.find((item) => item.iso_3166_1 === region)
    ?? releaseData.results?.find((item) => item.iso_3166_1 === "US");
  const candidates = (regional?.release_dates ?? [])
    .filter((item) => item.release_date && [3, 4, 5, 6].includes(item.type ?? 0))
    .map((item) => ({ date: item.release_date?.slice(0, 10) as string, type: item.type ?? 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const upcoming = candidates.find((item) => isWithinWindow(item.date, 0, 365));
  if (upcoming) {
    return {
      titleId: title.id,
      title: title.title,
      kind: "movie_release",
      date: upcoming.date,
      label: releaseTypeLabel(upcoming.type),
      detail: `${releaseTypeLabel(upcoming.type)} release in ${region}`,
    };
  }

  const recent = [...candidates].reverse().find((item) => isWithinWindow(item.date, -14, -1));
  if (recent) {
    return {
      titleId: title.id,
      title: title.title,
      kind: "recent_release",
      date: recent.date,
      label: "Recently released",
      detail: `${releaseTypeLabel(recent.type)} release in ${region}`,
    };
  }
  return null;
}

async function findTmdbId(title: WatchlistInput, token: string, region: string) {
  const type = title.mediaType === "movie" ? "movie" : "tv";
  const search = await fetchTmdb<TmdbSearchResponse>(`/search/${type}`, token, {
    query: title.title,
    ...(type === "movie" ? { region } : {}),
  });
  const normalizedTitle = normalize(title.title);
  const candidates = (search.results ?? []).filter((result) => typeof result.id === "number");
  const exact = candidates.find((result) => {
    const resultTitle = normalize(result.title ?? result.name ?? "");
    const date = result.release_date ?? result.first_air_date;
    const year = date ? Number(date.slice(0, 4)) : undefined;
    return resultTitle === normalizedTitle && (!title.year || !year || Math.abs(year - title.year) <= 1);
  });
  return exact?.id ?? candidates[0]?.id;
}

async function fetchTmdb<T>(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    next: { revalidate: 21600 },
  });
  if (!response.ok) throw new Error(`TMDB request failed with ${response.status}`);
  return response.json() as Promise<T>;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isWithinWindow(date: string, startDays: number, endDays: number) {
  const target = new Date(`${date.slice(0, 10)}T12:00:00Z`).getTime();
  if (!Number.isFinite(target)) return false;
  const today = new Date();
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12);
  const days = Math.round((target - startOfToday) / 86_400_000);
  return days >= startDays && days <= endDays;
}

function episodeLabel(episode: TvEpisode, verb: "airs" | "aired") {
  const number = episode.season_number && episode.episode_number
    ? `S${episode.season_number} E${episode.episode_number}`
    : "New episode";
  return `${number}${episode.name ? ` · ${episode.name}` : ""} ${verb}`;
}

function releaseTypeLabel(type: number) {
  if (type === 3) return "Theatrical";
  if (type === 4) return "Digital";
  if (type === 5) return "Physical";
  if (type === 6) return "TV";
  return "Release";
}
