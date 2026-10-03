export type TitleRouteInput = {
  title: string;
  mediaType?: "movie" | "show";
  watchmodeId?: number;
  tmdbId?: number;
};

export type ParsedTitleRoute = {
  source: "watchmode" | "tmdb";
  sourceId: number;
  mediaType?: "movie" | "show";
  titleHint: string;
};

export function slugifyTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "title";
}

export function titlePath(title: TitleRouteInput) {
  const slug = slugifyTitle(title.title);
  if (title.watchmodeId && title.watchmodeId > 0) return `/title/wm-${title.watchmodeId}-${slug}`;
  if (title.tmdbId && title.tmdbId > 0 && title.mediaType) return `/title/tmdb-${title.mediaType}-${title.tmdbId}-${slug}`;
  return null;
}

export function parseTitleKey(key: string): ParsedTitleRoute | null {
  const watchmode = /^wm-(\d+)-(.+)$/.exec(key);
  if (watchmode) {
    return {
      source: "watchmode",
      sourceId: Number(watchmode[1]),
      titleHint: humanizeSlug(watchmode[2]),
    };
  }

  const tmdb = /^tmdb-(movie|show)-(\d+)-(.+)$/.exec(key);
  if (tmdb) {
    return {
      source: "tmdb",
      mediaType: tmdb[1] as "movie" | "show",
      sourceId: Number(tmdb[2]),
      titleHint: humanizeSlug(tmdb[3]),
    };
  }
  return null;
}

export function humanizeSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((word) => word.length <= 3 ? word : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
