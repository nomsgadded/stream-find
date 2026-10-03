const TMDB_API = "https://api.themoviedb.org/3";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = Number(params.get("id"));
  const season = params.has("season") ? Number(params.get("season")) : null;
  if (!Number.isSafeInteger(id) || id <= 0 || (season !== null && (!params.get("season")?.trim() || !Number.isSafeInteger(season) || season < 0 || season > 1000))) {
    return Response.json({ error: "The selected series or season is invalid." }, { status: 400 });
  }
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) return Response.json({ error: "Episode details are not configured." }, { status: 503 });
  try {
    const response = await fetch(`${TMDB_API}/tv/${id}${season === null ? "" : `/season/${season}`}?language=en-US`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      next: { revalidate: 3600 }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return Response.json({ error: response.status === 404 ? "Episode details are not listed for this series yet." : "Episode details are temporarily unavailable." }, { status: response.status === 404 ? 404 : 502 });
    const data = await response.json();
    if (season === null) {
      if (!Array.isArray(data.seasons)) throw new Error("Invalid seasons");
      return Response.json({ seasons: data.seasons.filter((item: { season_number?: number }) => Number.isSafeInteger(item.season_number) && Number(item.season_number) >= 0).map((item: { season_number: number; name?: string; episode_count?: number }) => ({ seasonNumber: item.season_number, name: item.name || `Season ${item.season_number}`, episodeCount: item.episode_count ?? 0 })).sort((a: { seasonNumber: number }, b: { seasonNumber: number }) => a.seasonNumber - b.seasonNumber) });
    }
    if (!Array.isArray(data.episodes)) throw new Error("Invalid episodes");
    const episodes = data.episodes.filter((item: { episode_number?: number }) => Number.isSafeInteger(item.episode_number) && Number(item.episode_number) > 0).map((item: { episode_number: number; name?: string; overview?: string; air_date?: string; runtime?: number; still_path?: string; vote_average?: number; vote_count?: number }) => {
      const voteCount = Number.isSafeInteger(item.vote_count) && Number(item.vote_count) > 0 ? Number(item.vote_count) : 0;
      const rating = voteCount && typeof item.vote_average === "number" && Number.isFinite(item.vote_average) && item.vote_average > 0 && item.vote_average <= 10 ? item.vote_average : null;
      return { episodeNumber: item.episode_number, name: item.name || `Episode ${item.episode_number}`, overview: item.overview || "", airDate: item.air_date || null, runtime: typeof item.runtime === "number" && item.runtime > 0 ? item.runtime : null, stillUrl: item.still_path && /^\/[a-zA-Z0-9._-]+$/.test(item.still_path) ? `https://image.tmdb.org/t/p/w500${item.still_path}` : null, rating, voteCount };
    }).sort((a: { episodeNumber: number }, b: { episodeNumber: number }) => a.episodeNumber - b.episodeNumber);
    return Response.json({ episodes, seasonNumber: season, source: "TMDB" });
  } catch {
    return Response.json({ error: "Episode details are temporarily unavailable. Please try again." }, { status: 502 });
  }
}
