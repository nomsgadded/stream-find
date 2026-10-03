import { titlePath } from "@/lib/title-routes";
export type FavoriteEpisode = { tmdbId: number; showTitle: string; seasonNumber: number; episodeNumber: number; episodeName: string; posterUrl?: string; year?: number };
export function episodeKey(item: Pick<FavoriteEpisode, "tmdbId" | "seasonNumber" | "episodeNumber">) { return `${item.tmdbId}-${item.seasonNumber}-${item.episodeNumber}`; }
export function episodePath(item: FavoriteEpisode) {
  return `${titlePath({ title: item.showTitle, tmdbId: item.tmdbId, mediaType: "show" })}?season=${item.seasonNumber}&episode=${item.episodeNumber}#episode-${episodeKey(item)}`;
}
export function readEpisodeTarget(search: string) {
  const params = new URLSearchParams(search);
  const season = params.get("season"); const episode = params.get("episode");
  if (!season || !episode || !/^\d+$/.test(season) || !/^\d+$/.test(episode)) return null;
  const seasonNumber = Number(season); const episodeNumber = Number(episode);
  return Number.isSafeInteger(seasonNumber) && seasonNumber <= 1000 && Number.isSafeInteger(episodeNumber) && episodeNumber > 0 && episodeNumber <= 10000 ? { seasonNumber, episodeNumber } : null;
}
export function normalizeFavoriteEpisode(value: unknown): FavoriteEpisode | null {
  if (!value || typeof value !== "object") return null;
  const item = value as FavoriteEpisode;
  if (!Number.isSafeInteger(item.tmdbId) || item.tmdbId <= 0 || !Number.isSafeInteger(item.seasonNumber) || item.seasonNumber < 0 || item.seasonNumber > 1000 || !Number.isSafeInteger(item.episodeNumber) || item.episodeNumber <= 0 || item.episodeNumber > 10000 || typeof item.showTitle !== "string" || !item.showTitle.trim() || typeof item.episodeName !== "string" || !item.episodeName.trim()) return null;
  return { tmdbId: item.tmdbId, seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber, showTitle: item.showTitle.trim().slice(0,200), episodeName: item.episodeName.trim().slice(0,200), ...(typeof item.posterUrl === "string" && /^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+\/[a-zA-Z0-9._-]+$/.test(item.posterUrl) ? {posterUrl:item.posterUrl} : {}), ...(Number.isSafeInteger(item.year) && Number(item.year) > 0 ? {year:item.year} : {}) };
}
