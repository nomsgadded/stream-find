const WATCHMODE_API = "https://api.watchmode.com/v1";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w185";

type WatchmodeCredit = {
  full_name?: string | null;
  order?: number | null;
  person_id?: number;
  role?: string | null;
  type?: "Cast" | "Crew" | null;
};

type NormalizedCredit = {
  personId: number;
  name: string;
  role: string;
  type: "cast" | "crew";
  photoUrl?: string;
};

type TmdbPersonSearchResponse = {
  results?: Array<{
    id?: number;
    name?: string | null;
    profile_path?: string | null;
  }>;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const id = Number(requestUrl.searchParams.get("id"));

  if (!Number.isSafeInteger(id) || id <= 0) {
    return Response.json({ error: "The selected title is invalid." }, { status: 400 });
  }

  const apiKey = process.env.WATCHMODE_API_KEY;
  if (typeof apiKey !== "string" || !apiKey) {
    return Response.json({ error: "Cast information is not configured." }, { status: 503 });
  }

  try {
    const creditsUrl = new URL(`${WATCHMODE_API}/title/${id}/cast-crew/`);
    creditsUrl.searchParams.set("apiKey", apiKey);
    creditsUrl.searchParams.set("language", "en");

    const response = await fetch(creditsUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return Response.json({ error: "Cast information is temporarily unavailable." }, { status: response.status === 429 ? 429 : 502 });
    }

    const data = await response.json() as WatchmodeCredit[];
    const cast = normalizeCredits(data, "Cast", 8);
    const crew = normalizeCredits(
      data.filter((credit) => credit.type === "Crew" && /director|creator|writer|screenplay/i.test(credit.role ?? "")),
      "Crew",
      5,
    );

    const credits = [...cast, ...crew];
    const tmdbToken = process.env.TMDB_ACCESS_TOKEN?.trim();
    const enrichedCredits = typeof tmdbToken === "string" && tmdbToken
      ? await Promise.all(credits.map((credit) => addProfilePhoto(credit, tmdbToken)))
      : credits;

    return Response.json(
      { credits: enrichedCredits },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return Response.json({ error: "Cast information is temporarily unavailable." }, { status: 502 });
  }
}

async function addProfilePhoto(credit: NormalizedCredit, token: string): Promise<NormalizedCredit> {
  try {
    const searchUrl = new URL(`${TMDB_API}/search/person`);
    searchUrl.searchParams.set("query", credit.name);
    searchUrl.searchParams.set("include_adult", "false");
    searchUrl.searchParams.set("language", "en-US");
    searchUrl.searchParams.set("page", "1");

    const response = await fetch(searchUrl, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return credit;

    const data = await response.json() as TmdbPersonSearchResponse;
    const exactMatch = data.results?.find((person) => person.name?.toLowerCase() === credit.name.toLowerCase() && person.profile_path);
    const match = exactMatch ?? data.results?.find((person) => person.profile_path);
    const profilePath = match?.profile_path;
    if (!profilePath || !/^\/[a-zA-Z0-9._-]+$/.test(profilePath)) return credit;

    return {
      ...credit,
      ...(typeof match.id === "number" ? { personId: match.id } : {}),
      photoUrl: `${TMDB_IMAGE_BASE}${profilePath}`,
    };
  } catch {
    return credit;
  }
}

function normalizeCredits(data: WatchmodeCredit[], type: "Cast" | "Crew", limit: number): NormalizedCredit[] {
  return data
    .filter((credit) => credit.type === type && typeof credit.person_id === "number" && credit.full_name?.trim())
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
    .slice(0, limit)
    .map((credit) => ({
      personId: credit.person_id as number,
      name: credit.full_name?.trim() as string,
      role: credit.role?.trim() || (type === "Cast" ? "Cast" : "Crew"),
      type: type.toLowerCase() as "cast" | "crew",
    }));
}
