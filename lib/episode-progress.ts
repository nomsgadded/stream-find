import { episodeKey, type FavoriteEpisode } from "@/lib/episode-links";
type ProgressEpisode = { episodeNumber: number; airDate: string | null };
export function seasonProgress(tmdbId: number, season: number, episodes: ProgressEpisode[], watched: FavoriteEpisode[], today: string) {
  const watchedKeys = new Set(watched.map(episodeKey));
  const available = episodes.filter(episode => !episode.airDate || episode.airDate <= today);
  const count = episodes.filter(episode => watchedKeys.has(episodeKey({tmdbId,seasonNumber:season,episodeNumber:episode.episodeNumber}))).length;
  const next = available.find(episode => !watchedKeys.has(episodeKey({tmdbId,seasonNumber:season,episodeNumber:episode.episodeNumber}))) ?? null;
  return { count, total: episodes.length, next, complete: episodes.length > 0 && count === episodes.length };
}
