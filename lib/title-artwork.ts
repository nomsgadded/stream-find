export type ArtworkInput = { title: string; mediaType: "movie" | "show"; year?: number; tmdbId?: number; posterUrl?: string; backdropUrl?: string };
type Artwork = { posterUrl?: string; backdropUrl?: string; tmdbId?: number };
const requests = new Map<string, Promise<Artwork>>();

export function resolveTitleArtwork(title: ArtworkInput): Promise<Artwork> {
  if (title.posterUrl) return Promise.resolve({ posterUrl: title.posterUrl, backdropUrl: title.backdropUrl });
  const params = new URLSearchParams({ title: title.title, type: title.mediaType });
  if (title.tmdbId) params.set("tmdbId", String(title.tmdbId));
  if (title.year) params.set("year", String(title.year));
  const key = params.toString();
  let request = requests.get(key);
  if (!request) {
    request = fetch(`/api/title-artwork?${key}`).then(async (response) => {
      if (!response.ok) throw new Error("Artwork lookup failed");
      return await response.json() as Artwork;
    }).catch(() => { requests.delete(key); return {}; });
    requests.set(key, request);
  }
  return request;
}
