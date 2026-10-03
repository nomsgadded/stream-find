import { getRegionConfig } from "@/lib/regions";
import { normalizedService } from "@/lib/offer-priority";

const API = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p";

type Provider = { provider_id: number; provider_name: string };
type TmdbTitle = { id: number; title?: string; name?: string; poster_path?: string | null; release_date?: string; first_air_date?: string; genre_ids?: number[]; vote_average?: number; popularity?: number };
type Availability = { results?: Record<string, { flatrate?: Provider[] }> };
export type MemberTaste = { uid: string; name: string; region: string; services: string[]; genres: string[]; saved: Set<string> };
export type GroupCandidate = {
  key: string; tmdbId: number; mediaType: "movie" | "show"; title: string; year?: number;
  posterUrl: string; availableOn: string[]; includedFor: number; savedBy: string[];
  reason: string; rank: number;
};

const moodGenres: Record<string, { movie: string; show: string }> = {
  Funny: { movie: "35", show: "35" },
  "Rom-com": { movie: "35,10749", show: "35" },
  Thrilling: { movie: "53", show: "80" },
  Heartwarming: { movie: "10749|10751", show: "10751|35" },
  "Sci-fi": { movie: "878", show: "10765" },
};
const genreNames: Record<number, string> = {
  12: "Adventure", 14: "Fantasy", 16: "Animation", 18: "Drama", 27: "Horror", 28: "Action", 35: "Comedy", 53: "Thriller", 80: "Crime", 99: "Documentary", 878: "Science fiction", 9648: "Mystery", 10402: "Music", 10749: "Romance", 10751: "Family", 10759: "Action & adventure", 10765: "Sci-fi & fantasy",
};

export const moods = ["Any", ...Object.keys(moodGenres)];
export const durations = ["Any", "Under 2 hours", "One episode"];

export function sharedServices(members: Pick<MemberTaste, "services">[]) {
  if (!members.length) return [];
  const [first, ...others] = members;
  return [...new Set(first.services.map(normalizedService).filter(Boolean))]
    .filter((service) => others.every((member) => member.services.some((name) => normalizedService(name) === service)));
}

async function tmdb<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API}${path}`);
  url.searchParams.set("language", "en-US");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`TMDB returned ${response.status}`);
  return response.json() as Promise<T>;
}

export async function groupCandidates(members: MemberTaste[], mood: string, duration: string, token: string) {
  if (!members.length) return [];
  const region = getRegionConfig(members[0].region).code;
  const services = sharedServices(members);
  if (!services.length) return [];
  // TV has no Romance genre in TMDB, so combine Comedy with its romance keyword.
  const romanceKeyword = mood === "Rom-com"
    ? (await tmdb<{ results?: Array<{ id: number; name: string }> }>("/search/keyword", token, { query: "romance" }).catch(() => ({ results: [] })))
      .results?.find((keyword) => keyword.name.toLowerCase() === "romance")?.id
    : undefined;
  const types = duration === "One episode" ? ["show" as const] : ["movie" as const, "show" as const];
  const results = await Promise.all(types.map(async (mediaType) => {
    const endpoint = mediaType === "show" ? "tv" : "movie";
    const directory = await tmdb<{ results?: Provider[] }>(`/watch/providers/${endpoint}`, token, { watch_region: region });
    const ids = (directory.results ?? []).filter((provider) => services.includes(normalizedService(provider.provider_name))).map((provider) => provider.provider_id);
    if (!ids.length) return [];
    const parameters: Record<string, string> = {
      watch_region: region, with_watch_providers: ids.join("|"), with_watch_monetization_types: "flatrate",
      sort_by: "popularity.desc", include_adult: "false", "vote_count.gte": "30",
    };
    if (moodGenres[mood]) parameters.with_genres = moodGenres[mood][mediaType];
    if (mood === "Rom-com" && mediaType === "show") {
      if (!romanceKeyword) return [];
      parameters.with_keywords = String(romanceKeyword);
    }
    if (duration === "Under 2 hours") parameters["with_runtime.lte"] = "120";
    const titles = await tmdb<{ results?: TmdbTitle[] }>(`/discover/${endpoint}`, token, parameters);
    return (titles.results ?? []).filter((item) => item.id && item.poster_path && (item.title || item.name)).slice(0, 12).map((item) => ({ ...item, mediaType }));
  }));
  const pool = results.flat();
  const candidates = await Promise.all(pool.map(async (item): Promise<GroupCandidate | null> => {
    const mediaType = item.mediaType;
    const title = item.title || item.name || "";
    const key = `${mediaType}-${item.id}`;
    try {
      const response = await tmdb<Availability>(`/${mediaType === "show" ? "tv" : "movie"}/${item.id}/watch/providers`, token);
      const listed = response.results?.[region]?.flatrate ?? [];
      const availableOn = [...new Set(listed.filter((provider) => {
        const service = normalizedService(provider.provider_name);
        return services.includes(service) && members.every((member) =>
          (response.results?.[member.region]?.flatrate ?? []).some((offer) => normalizedService(offer.provider_name) === service));
      }).map((provider) => provider.provider_name))];
      if (!availableOn.length) return null;
      const savedBy = members.filter((member) => member.saved.has(key)).map((member) => member.name);
      const titleGenres = (item.genre_ids ?? []).map((id) => genreNames[id]?.toLowerCase());
      const taste = members.reduce((total, member) => total + member.genres.filter((name) => titleGenres.includes(name.toLowerCase())).length, 0);
      const rank = savedBy.length * 8 + taste * 2
        + (item.vote_average ?? 0) + Math.log10((item.popularity ?? 0) + 1) * 2;
      const reason = `${members.length === 1 ? "Included on your service" : "Included on a service everyone has"}${savedBy.length ? ` · ${savedBy.length} saved it` : ""}`;
      return { key, tmdbId: item.id, mediaType, title, year: Number((item.release_date || item.first_air_date || "").slice(0, 4)) || undefined,
        posterUrl: `${IMAGE}/w342${item.poster_path}`, availableOn, includedFor: members.length, savedBy, reason, rank };
    } catch { return null; }
  }));
  return candidates.filter((item): item is GroupCandidate => Boolean(item))
    .sort((a, b) => b.rank - a.rank).slice(0, 8);
}
