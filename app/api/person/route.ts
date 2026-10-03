const TMDB_API = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";

type Credit = {
  id?: number;
  title?: string;
  name?: string;
  media_type?: "movie" | "tv";
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  episode_count?: number;
  character?: string;
  job?: string;
  department?: string;
  adult?: boolean;
};

type PersonDetails = {
  id?: number;
  name?: string;
  biography?: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  known_for_department?: string;
  profile_path?: string | null;
  also_known_as?: string[];
  homepage?: string | null;
  external_ids?: { imdb_id?: string | null };
  combined_credits?: { cast?: Credit[]; crew?: Credit[] };
  images?: { profiles?: Array<{ file_path?: string | null; vote_average?: number; width?: number }> };
};

export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "The selected person is invalid." }, { status: 400 });

  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) return Response.json({ error: "Person profiles are not configured." }, { status: 503 });

  try {
    const url = new URL(`${TMDB_API}/person/${id}`);
    url.searchParams.set("language", "en-US");
    url.searchParams.set("append_to_response", "combined_credits,images,external_ids");
    const response = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      next: { revalidate: 86400 },
    });
    if (!response.ok) return Response.json({ error: response.status === 404 ? "That person could not be found." : "This profile is temporarily unavailable." }, { status: response.status === 404 ? 404 : 502 });

    const details = await response.json() as PersonDetails;
    if (!details.name || !details.id) return Response.json({ error: "That person could not be found." }, { status: 404 });
    const credits = normalizeCredits(details.combined_credits, details.name);
    const alternatePhoto = [...(details.images?.profiles ?? [])]
      .filter((image) => image.file_path)
      .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0) || (b.width ?? 0) - (a.width ?? 0))[0]?.file_path;

    return Response.json({
      person: {
        id: details.id,
        name: details.name,
        biography: details.biography?.trim() || "Biography unavailable.",
        department: details.known_for_department || "Film and television",
        birthday: details.birthday || undefined,
        deathday: details.deathday || undefined,
        placeOfBirth: details.place_of_birth || undefined,
        profileUrl: imageUrl(details.profile_path || alternatePhoto, "h632"),
        alsoKnownAs: (details.also_known_as ?? []).slice(0, 4),
        imdbUrl: details.external_ids?.imdb_id ? `https://www.imdb.com/name/${details.external_ids.imdb_id}/` : undefined,
        homepage: safeUrl(details.homepage),
      },
      credits,
      stats: {
        movies: credits.filter((credit) => credit.mediaType === "movie").length,
        shows: credits.filter((credit) => credit.mediaType === "show").length,
      },
      attribution: { label: "Profile and credits by TMDB", url: "https://www.themoviedb.org/" },
    }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
  } catch {
    return Response.json({ error: "This profile is temporarily unavailable." }, { status: 502 });
  }
}

function normalizeCredits(source: PersonDetails["combined_credits"], personName: string) {
  const combined = [
    ...(source?.cast ?? []).map((credit) => ({ ...credit, creditType: "cast" as const })),
    ...(source?.crew ?? []).map((credit) => ({ ...credit, creditType: "crew" as const })),
  ];
  const unique = new Map<string, ReturnType<typeof normalizeCredit>>();
  for (const credit of combined) {
    if (credit.adult || !credit.id || !credit.media_type || !(credit.title || credit.name) || !credit.poster_path) continue;
    if (credit.media_type === "tv" && credit.creditType === "cast" && (credit.episode_count ?? 1) <= 1) continue;
    const normalized = normalizeCredit(credit, personName);
    if (/^self\b|archive footage|uncredited/i.test(normalized.role)) continue;
    const key = `${normalized.mediaType}-${normalized.tmdbId}`;
    const existing = unique.get(key);
    if (!existing || normalized.rank > existing.rank) unique.set(key, normalized);
  }
  return [...unique.values()]
    .sort((a, b) => b.rank - a.rank || (b.year ?? 0) - (a.year ?? 0))
    .slice(0, 36)
    .map(stripRank);
}

function stripRank<T extends { rank: number }>(value: T): Omit<T, "rank"> {
  const copy: Partial<T> = { ...value };
  delete copy.rank;
  return copy as Omit<T, "rank">;
}

function normalizeCredit(credit: Credit & { creditType: "cast" | "crew" }, personName: string) {
  const mediaType = credit.media_type === "tv" ? "show" as const : "movie" as const;
  const date = credit.release_date || credit.first_air_date;
  const role = credit.creditType === "cast"
    ? credit.character?.trim() || "Cast"
    : credit.job?.trim() || credit.department?.trim() || "Crew";
  return {
    tmdbId: credit.id as number,
    title: (credit.title || credit.name) as string,
    mediaType,
    year: date ? Number(date.slice(0, 4)) || undefined : undefined,
    role: role.replace(new RegExp(`^${escapeRegExp(personName)}$`, "i"), "Cast"),
    score: credit.vote_average ? Math.round(credit.vote_average * 10) : 0,
    posterUrl: imageUrl(credit.poster_path, "w342"),
    backdropUrl: imageUrl(credit.backdrop_path, "w780"),
    rank: (credit.popularity ?? 0) / 5
      + Math.log10((credit.vote_count ?? 0) + 1) * 16
      + (credit.vote_average ?? 0) * 2
      + (credit.creditType === "cast" ? 4 : 0)
      + (credit.media_type === "tv" ? Math.log2((credit.episode_count ?? 1) + 1) * 5 - ((credit.episode_count ?? 1) <= 1 ? 24 : 0) : 0),
  };
}

function imageUrl(path?: string | null, size = "w500") {
  return path && /^\/[a-zA-Z0-9._-]+$/.test(path) ? `${IMAGE_BASE}/${size}${path}` : undefined;
}

function safeUrl(value?: string | null) {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
