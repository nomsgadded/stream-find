"use client";

import { useEffect, useState, type ReactNode } from "react";
import { resolveTitleArtwork } from "@/lib/title-artwork";

export default function TitleArtwork({ title, className, children }: {
  title: { title: string; mediaType?: "movie" | "show"; year?: number; tmdbId?: number; posterUrl?: string; backdropUrl?: string };
  className: string; children?: ReactNode;
}) {
  const [resolved, setResolved] = useState<{ key: string; image?: string } | null>(null);
  const { title: name, mediaType, year, tmdbId, posterUrl, backdropUrl } = title;
  const key = `${mediaType}:${tmdbId ?? name}:${year ?? ""}`;
  useEffect(() => {
    if (posterUrl || !mediaType) return;
    let cancelled = false;
    void resolveTitleArtwork({ title: name, mediaType, year, tmdbId }).then((artwork) => {
      if (!cancelled) setResolved({ key, image: artwork.posterUrl || artwork.backdropUrl });
    });
    return () => { cancelled = true; };
  }, [name, mediaType, year, tmdbId, posterUrl, key]);
  const image = posterUrl || (resolved?.key === key ? resolved.image : undefined) || backdropUrl;
  return <span className={className} style={image ? { backgroundImage: `url(${JSON.stringify(image)})` } : undefined}>{children}</span>;
}
