"use client";
import Image from "next/image";
import Link from "next/link";
import { episodeKey, episodePath, type FavoriteEpisode } from "@/lib/episode-links";
import { rememberTitleNavigation } from "@/lib/title-navigation";
import { EpisodeShare, useEpisodeFavorites } from "@/components/EpisodeActions";
import { useState } from "react";

export default function FavoriteEpisodes({ variant = "account" }: { variant?: "account" | "watchlist" }) {
  const favorites = useEpisodeFavorites();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [sharing, setSharing] = useState<FavoriteEpisode | null>(null);
  const headingId = `favorite-episodes-${variant}-heading`;
  return <section className={`favoriteEpisodes ${variant === "watchlist" ? "watchlistEpisodes" : ""}`} aria-labelledby={headingId}>
    <h3 id={headingId}>Favorite episodes</h3>
    {!favorites.authReady ? <p role="status">Loading favorite episodes…</p>
      : !favorites.user ? <div className="episodeFavoritesEmpty"><p>Sign in to see your favorite episodes across devices.</p><Link href="/?panel=account">Sign in</Link></div>
      : favorites.error ? <p role="alert">{favorites.error} <button type="button" onClick={favorites.retry}>Try again</button></p>
      : !favorites.ready ? <p role="status">Loading favorite episodes…</p>
      : !favorites.favorites.length ? <div className="episodeFavoritesEmpty"><p>Heart an episode in a show’s episode guide to save it here for sharing and revisiting.</p><Link href="/">Explore shows →</Link></div>
      : <><p className="episodeFavoriteCount">{favorites.favorites.length} {favorites.favorites.length === 1 ? "episode" : "episodes"} · Tap an episode to open its guide.</p><div className="episodeFavoritesList">{favorites.favorites.map(episode => <article key={episodeKey(episode)}>
        <Link href={episodePath(episode)} className="episodeFavoriteLink" onClick={() => rememberTitleNavigation(episodePath(episode))}>
          {episode.posterUrl ? <Image src={episode.posterUrl} alt="" width={48} height={72} unoptimized /> : <span className="episodeFavoritePlaceholder" aria-hidden="true">{episode.showTitle.charAt(0)}</span>}
          <span><strong>{episode.showTitle}</strong><small>Season {episode.seasonNumber} · Episode {episode.episodeNumber}</small><span className="episodeFavoriteName">{episode.episodeName}</span></span>
        </Link>
        <div className="episodeFavoriteButtons"><button type="button" aria-label={`Share ${episode.showTitle} season ${episode.seasonNumber} episode ${episode.episodeNumber}`} onClick={() => setSharing(episode)}>Share ↗</button>
          <button type="button" aria-label={`Remove ${episode.showTitle} season ${episode.seasonNumber} episode ${episode.episodeNumber} from favorite episodes`} disabled={busy !== null} onClick={() => {
            setBusy(episodeKey(episode)); setError("");
            void favorites.action("remove", episode).catch(() => setError("That favorite could not be removed. Try again.")).finally(() => setBusy(null));
          }}>{busy === episodeKey(episode) ? "Removing…" : "Remove"}</button></div>
      </article>)}</div></>}
    {error && <p role="alert">{error}</p>}
    {sharing && <EpisodeShare episode={sharing} favorites={favorites} onClose={() => setSharing(null)} />}
  </section>;
}
