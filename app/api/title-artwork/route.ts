type ArtworkTitle = {
  id: number; title?: string; name?: string; original_title?: string; original_name?: string;
  release_date?: string; first_air_date?: string; poster_path?: string; backdrop_path?: string;
};

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const title = params.get("title")?.trim() ?? "";
  const id = Number(params.get("tmdbId"));
  const year = Number(params.get("year"));
  if (!["movie", "show"].includes(type ?? "") || title.length > 200 || (!title && !(Number.isSafeInteger(id) && id > 0))) {
    return Response.json({ error: "Invalid title." }, { status: 400 });
  }
  const token = process.env.TMDB_ACCESS_TOKEN?.trim();
  if (!token) return Response.json({ error: "Artwork is not configured." }, { status: 503 });
  const endpoint = type === "show" ? "tv" : "movie";
  try {
    const url = new URL(`https://api.themoviedb.org/3/${Number.isSafeInteger(id) && id > 0 ? `${endpoint}/${id}` : `search/${endpoint}`}`);
    if (!(id > 0)) url.searchParams.set("query", title);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      next: { revalidate: 21600 },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("Artwork lookup failed");
    const data = await response.json() as ArtworkTitle & { results?: ArtworkTitle[] };
    const matches = (data.results ?? []).filter((item) =>
      [item.title, item.name, item.original_title, item.original_name].some((name) => name && normalize(name) === normalize(title))
      && (!year || Number((item.release_date || item.first_air_date || "").slice(0, 4)) === year));
    const match = id > 0 ? data : matches.length === 1 ? matches[0] : undefined;
    return Response.json(match ? {
      tmdbId: match.id,
      ...(match.poster_path ? { posterUrl: `https://image.tmdb.org/t/p/w500${match.poster_path}` } : {}),
      ...(match.backdrop_path ? { backdropUrl: `https://image.tmdb.org/t/p/w780${match.backdrop_path}` } : {}),
    } : {}, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch {
    return Response.json({ error: "Artwork could not be loaded." }, { status: 502 });
  }
}
