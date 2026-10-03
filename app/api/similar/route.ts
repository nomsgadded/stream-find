const WATCHMODE_API = "https://api.watchmode.com/v1";
const MAX_RESULTS = 4;

type WatchmodeDetails = {
  backdrop?: string | null;
  critic_score?: number | null;
  genre_names?: string[] | null;
  id?: number;
  plot_overview?: string | null;
  poster?: string | null;
  posterLarge?: string | null;
  posterMedium?: string | null;
  title?: string | null;
  type?: string | null;
  user_rating?: number | null;
  year?: number | null;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const ids = [...new Set((requestUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0))]
    .slice(0, MAX_RESULTS);

  if (!ids.length) return Response.json({ titles: [] });

  const apiKey = process.env.WATCHMODE_API_KEY;
  if (typeof apiKey !== "string" || !apiKey) {
    return Response.json({ error: "Recommendations are not configured." }, { status: 503 });
  }

  try {
    const results = await Promise.allSettled(ids.map((id) => fetchTitle(id, apiKey)));
    const titles = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);

    return Response.json(
      { titles },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch {
    return Response.json({ error: "Recommendations are temporarily unavailable." }, { status: 502 });
  }
}

async function fetchTitle(id: number, apiKey: string) {
  const detailsUrl = new URL(`${WATCHMODE_API}/title/${id}/details/`);
  detailsUrl.searchParams.set("apiKey", apiKey);

  const response = await fetch(detailsUrl, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;

  const details = await response.json() as WatchmodeDetails;
  const title = details.title?.trim();
  if (!title) return null;

  const posterUrl = safeUrl(details.posterLarge) ?? safeUrl(details.posterMedium) ?? safeUrl(details.poster);
  const backdropUrl = safeUrl(details.backdrop) ?? posterUrl;
  const criticScore = Number(details.critic_score);
  const userScore = Number(details.user_rating);
  const score = Number.isFinite(criticScore) && criticScore > 0
    ? Math.round(criticScore)
    : Number.isFinite(userScore) && userScore > 0
      ? Math.round(userScore * 10)
      : 0;

  return {
    watchmodeId: details.id ?? id,
    title,
    year: details.year ?? new Date().getUTCFullYear(),
    mediaType: details.type?.includes("movie") ? "movie" as const : "show" as const,
    genres: (details.genre_names ?? []).slice(0, 2),
    synopsis: details.plot_overview?.trim() || "Synopsis unavailable.",
    score,
    ...(posterUrl ? { posterUrl } : {}),
    ...(backdropUrl ? { backdropUrl } : {}),
  };
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
