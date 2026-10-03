"use client";
import Image from "next/image";
import { episodeKey, episodePath } from "@/lib/episode-links";
import { useEpisodeFavorites } from "@/components/EpisodeActions";
import { useState } from "react";
export default function FavoriteEpisodes() {
  const favorites=useEpisodeFavorites();const [error,setError]=useState("");const [busy,setBusy]=useState<string|null>(null);
  return <section className="favoriteEpisodes" aria-labelledby="favorite-episodes-heading"><h3 id="favorite-episodes-heading">Favorite episodes</h3>{favorites.error?<p role="alert">{favorites.error} <button type="button" onClick={favorites.retry}>Try again</button></p>:!favorites.ready?<p role="status">Loading favorite episodes…</p>:!favorites.favorites.length?<p>Heart an episode to keep it here for sharing later.</p>:<div>{favorites.favorites.map(episode=><article key={episodeKey(episode)}><a href={episodePath(episode)}>{episode.posterUrl&&<Image src={episode.posterUrl} alt="" width={48} height={72} unoptimized />}<span><strong>{episode.showTitle}</strong><small>S{episode.seasonNumber} · E{episode.episodeNumber} — {episode.episodeName}</small></span></a><button type="button" aria-label={`Remove ${episode.episodeName} from favorite episodes`} disabled={busy!==null} onClick={()=>{setBusy(episodeKey(episode));setError("");void favorites.action('remove',episode).catch(()=>setError('That favorite could not be removed.')).finally(()=>setBusy(null));}}>Remove</button></article>)}</div>}{error&&<p role="alert">{error}</p>}</section>;
}
