import { getRegionConfig } from "@/lib/regions";

const API = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p";

type Provider = { provider_id: number; provider_name: string };
type TmdbItem = {
  id: number; title?: string; name?: string;
  adult?: boolean;
  poster_path?: string | null; profile_path?: string | null;
  release_date?: string; first_air_date?: string; vote_average?: number;
};
type Genre = "all" | "k-drama" | "anime" | "comedy" | "crime" | "documentary";
const genreIds: Record<Exclude<Genre, "all" | "k-drama">, string> = {
  anime: "16", comedy: "35", crime: "80", documentary: "99",
};

const normalized = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "")
  .replace(/^hbomax$/, "max").replace(/^amazonprimevideo$/, "primevideo")
  .replace(/^amazonvideo$/, "primevideo").replace(/^appletvplus$/, "appletv")
  .replace(/^disneyplus$/, "disney");

async function tmdb<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API}${path}`);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`TMDB ${response.status}`);
  return response.json() as Promise<T>;
}

async function popularOnService(type: "tv" | "movie", service: string, region: string, token: string, genre: Genre = "all") {
  const directory = await tmdb<{ results?: Provider[] }>(`/watch/providers/${type}`, token, { watch_region: region });
  const provider = (directory.results ?? []).find((item) => normalized(item.provider_name) === normalized(service));
  if (!provider) return [] as TmdbItem[];
  const filters: Record<string, string> = {};
  if (genre === "k-drama") Object.assign(filters, { with_origin_country: "KR", with_original_language: "ko", with_genres: "18" });
  else if (genre !== "all") {
    filters.with_genres = genreIds[genre];
    if (genre === "anime") filters.with_original_language = "ja";
  }
  const data = await tmdb<{ results?: TmdbItem[] }>(`/discover/${type}`, token, {
    watch_region: region,
    with_watch_providers: String(provider.provider_id),
    with_watch_monetization_types: "flatrate",
    sort_by: "popularity.desc",
    include_adult: "false",
    "vote_count.gte": genre === "all" ? "20" : "5",
    ...filters,
  });
  return data.results ?? [];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "show" && kind !== "movie" && kind !== "person") {
    return Response.json({ error: "Choose shows, movies, or people." }, { status: 400 });
  }
  const requestedGenre = url.searchParams.get("genre") ?? "all";
  if (!["all", "k-drama", "anime", "comedy", "crime", "documentary"].includes(requestedGenre) || (kind === "person" && requestedGenre !== "all")) {
    return Response.json({ error: "Choose an available genre." }, { status: 400 });
  }
  const genre = requestedGenre as Genre;
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) return Response.json({ error: "Discovery is not configured." }, { status: 503 });
  const region = getRegionConfig(url.searchParams.get("region"));
  const service = url.searchParams.get("service")?.trim().slice(0, 80) ?? "";
  if (!service) return Response.json({ error: "Choose a service." }, { status: 400 });

  try {
    if (kind === "person") {
      const [movies, shows] = await Promise.all([
        popularOnService("movie", service, region.code, token),
        popularOnService("tv", service, region.code, token),
      ]);
      const trending = [
        ...movies.filter((item) => !item.adult).slice(0, 4).map((item) => ({ id: item.id, type: "movie" })),
        ...shows.filter((item) => !item.adult).slice(0, 4).map((item) => ({ id: item.id, type: "tv" })),
      ];
      const casts = await Promise.allSettled(trending.map((item) => tmdb<{ cast?: TmdbItem[] }>(`/${item.type}/${item.id}/credits`, token)));
      const people = [...new Map(casts.flatMap((result) => result.status === "fulfilled" ? (result.value.cast ?? []).slice(0, 5) : [])
        .filter((person) => person.id && person.name && person.profile_path && !person.adult)
        .map((person) => [person.id, { id: person.id, name: person.name, photoUrl: `${IMAGE}/w342${person.profile_path}` }])).values()].slice(0, 12);
      return Response.json({ people, label: `Actors in popular titles on ${service}`, source: `Cast from TMDB titles listed on ${service} in ${region.code}` }, { headers: { "Cache-Control": "public, s-maxage=3600" } });
    }

    const endpoint = kind === "show" ? "tv" : "movie";
    const data = await popularOnService(endpoint, service, region.code, token, genre);
    const titles = data.filter((item) => item.id && item.poster_path && (item.title || item.name))
      .slice(0, 10).map((item) => ({
        id: item.id, tmdbId: item.id, mediaType: kind, title: item.title || item.name,
        year: Number((item.release_date || item.first_air_date || "").slice(0, 4)) || undefined,
        posterUrl: `${IMAGE}/w342${item.poster_path}`,
        score: item.vote_average ? Math.round(item.vote_average * 10) : undefined,
      }));
    return Response.json({ titles, label: `Popular ${kind === "show" ? "shows" : "movies"} on ${service}`, source: `TMDB popularity among titles listed on ${service} in ${region.code}; not an official ${service} chart` }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600" } });
  } catch {
    return Response.json({ error: "These picks could not load right now." }, { status: 502 });
  }
}
