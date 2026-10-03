"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import EpisodeActions, { useEpisodeFavorites, type EpisodeFavorites } from "@/components/EpisodeActions";
import { seasonProgress } from "@/lib/episode-progress";
import { readEpisodeTarget } from "@/lib/episode-links";

type Season = { seasonNumber: number; name: string; episodeCount: number };
type Episode = { episodeNumber: number; name: string; overview: string; airDate: string | null; runtime: number | null; stillUrl: string | null; rating: number | null; voteCount: number };

export default function EpisodeGuide({ tmdbId, seasonNumber, onSeasonChange, showTitle = "Series", posterUrl, year }: { tmdbId: number; seasonNumber?: number | null; onSeasonChange?: (season: number) => void; showTitle?: string; posterUrl?: string; year?: number }) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const favorites = useEpisodeFavorites(tmdbId);
  const [hideImages, setHideImages] = useState(false);
  const lastWatched = favorites.watched.find(episode => episode.tmdbId === tmdbId);
  const activeSeason = seasons?.some((season) => season.seasonNumber === seasonNumber) ? seasonNumber : selected;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/episodes?id=${tmdbId}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.seasons)) throw new Error(data.error || "Episode guide could not load.");
      if (controller.signal.aborted) return;
      setSeasons(data.seasons);
      const shared = window.location.pathname.startsWith("/title/") ? readEpisodeTarget(window.location.search) : null;
      const sharedSeason = shared && data.seasons.some((season: Season) => season.seasonNumber === shared.seasonNumber) ? shared.seasonNumber : null;
      setSelected((current) => current ?? sharedSeason ?? data.seasons.find((season: Season) => season.seasonNumber > 0)?.seasonNumber ?? data.seasons[0]?.seasonNumber ?? null);
      if (sharedSeason !== null) onSeasonChange?.(sharedSeason);
    }).catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Episode guide could not load."); });
    return () => controller.abort();
  }, [tmdbId, retry, onSeasonChange]);
  return <section className="episodeGuide" aria-labelledby="episode-guide-title">
    <div className="titleSectionHeading"><div><p className="sectionKicker">Explore the season</p><h2 id="episode-guide-title">Episode ratings</h2></div></div>
    {favorites.error && <p role="status">{favorites.error} <button type="button" onClick={favorites.retry}>Retry favorites</button></p>}
    <p className="episodeSource">Audience ratings from TMDB · Scores out of 10. Your hearts and watched marks are private preferences and do not change these scores.</p>
    {error ? <div role="alert"><p>{error}</p><button className="titleCreditsExpand" type="button" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Retry episode guide</button></div> : seasons === null ? <p role="status">Loading seasons…</p> : !seasons.length ? <p>No episodes are listed yet.</p> : <>
      {favorites.user && favorites.ready && <div className="episodeProgressSummary">{lastWatched ? <><p>Last watched: S{lastWatched.seasonNumber} · E{lastWatched.episodeNumber} — {lastWatched.episodeName}</p><button type="button" onClick={() => { setSelected(lastWatched.seasonNumber); onSeasonChange?.(lastWatched.seasonNumber); }}>Continue season {lastWatched.seasonNumber}</button></> : <p>Mark an episode watched to remember where you left off.</p>}{favorites.progressLimited && <p>Showing your 5,000 most recently watched episodes.</p>}</div>}
      <button className="episodeImageToggle" type="button" aria-pressed={hideImages} onClick={() => setHideImages(value => !value)}>{hideImages ? "Show episode images" : "Hide episode images"}</button>
      <label className="episodeSeasonSelect">Season<select value={activeSeason ?? ""} onChange={(event) => { const next = Number(event.target.value); setSelected(next); onSeasonChange?.(next); }}>{seasons.map((season) => <option value={season.seasonNumber} key={season.seasonNumber}>{season.name} · {season.episodeCount} episodes</option>)}</select></label>
      {activeSeason != null && <SeasonEpisodes key={`${tmdbId}-${activeSeason}`} tmdbId={tmdbId} season={activeSeason} showTitle={showTitle} posterUrl={posterUrl} year={year} favorites={favorites} hideImages={hideImages} />}
    </>}
  </section>;
}

function SeasonEpisodes({ tmdbId, season, showTitle, posterUrl, year, favorites, hideImages = false }: { tmdbId: number; season: number; showTitle: string; posterUrl?: string; year?: number; favorites: EpisodeFavorites; hideImages?: boolean }) {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/episodes?id=${tmdbId}&season=${season}`, { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.episodes)) throw new Error(data.error || "Episode details could not load.");
      if (!controller.signal.aborted) setEpisodes(data.episodes);
    }).catch((caught) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Episode details could not load."); });
    return () => controller.abort();
  }, [tmdbId, season, retry]);
  useEffect(() => {
    if (!episodes || !window.location.pathname.startsWith("/title/")) return;
    const target = readEpisodeTarget(window.location.search);
    if (!target || target.seasonNumber !== season) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(`episode-${tmdbId}-${season}-${target.episodeNumber}`);
      element?.scrollIntoView({ block: "start", behavior: "instant" });
      element?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [episodes, tmdbId, season]);
  if (error) return <div role="alert"><p>{error}</p><button className="titleCreditsExpand" type="button" onClick={() => { setError(""); setRetry((value) => value + 1); }}>Retry episodes</button></div>;
  if (episodes === null) return <p role="status">Loading episode ratings…</p>;
  if (!episodes.length) return <p>No episodes are listed for this season yet.</p>;
  const progress = seasonProgress(tmdbId, season, episodes, favorites.watched, new Date().toISOString().slice(0, 10));
  return <>
    {favorites.user && favorites.ready && <div className="episodeProgressSummary"><p>{progress.count} of {progress.total} episodes watched{progress.complete ? " · Season complete" : ""}</p>{progress.next && <button type="button" onClick={(event) => jumpToEpisode(event.currentTarget, `episode-${tmdbId}-${season}-${progress.next!.episodeNumber}`)}>Next unwatched: Episode {progress.next.episodeNumber} →</button>}</div>}
    <div className="episodeRatingGrid" aria-label={`Season ${season} ratings overview`}>{episodes.map((episode) => <a href={`#episode-${tmdbId}-${season}-${episode.episodeNumber}`} onClick={(event) => {
      event.preventDefault();
      const target = document.getElementById(`episode-${tmdbId}-${season}-${episode.episodeNumber}`);
      if (!target) return;
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
      const dialog = event.currentTarget.closest('[role="dialog"]');
      if (dialog instanceof HTMLElement) dialog.scrollTo({ top: dialog.scrollTop + target.getBoundingClientRect().top - dialog.getBoundingClientRect().top - 90, behavior });
      else target.scrollIntoView({ block: "start", behavior });
      target.focus({ preventScroll: true });
    }} key={episode.episodeNumber} className={episode.rating === null ? "unrated" : episode.voteCount < 10 ? "fewVotes" : episode.rating >= 8 ? "highRating" : "rated"} aria-label={`Episode ${episode.episodeNumber}: ${episode.rating === null ? "Not rated" : `${episode.rating.toFixed(1)} out of 10, ${episode.voteCount} votes`}`}><small>E{episode.episodeNumber}</small><strong>{episode.rating?.toFixed(1) ?? "—"}</strong></a>)}</div>
    <p className="episodeSource">Tap a score to jump to its episode. Ratings with fewer than 10 votes are marked as early ratings. Descriptions stay hidden until opened. Use Hide episode images for spoiler-sensitive viewing.</p>
    <div className="episodeList">{episodes.map((episode) => <article id={`episode-${tmdbId}-${season}-${episode.episodeNumber}`} tabIndex={-1} key={episode.episodeNumber}>
      <div className="episodeHeading">{!hideImages && <span className="episodeThumbnail">{episode.stillUrl || posterUrl ? <Image src={episode.stillUrl ?? posterUrl!} alt="" width={160} height={90} unoptimized loading="lazy" /> : <span aria-hidden="true">E{episode.episodeNumber}</span>}</span>}<div><small>S{season} · E{episode.episodeNumber}</small><h3>{episode.name}</h3><p>{[episode.airDate ? formatAirDate(episode.airDate) : "Air date unannounced", episode.runtime ? `${episode.runtime} min` : null].filter(Boolean).join(" · ")}</p></div><div className="episodeScore"><strong>{episode.rating === null ? "Not rated" : `★ ${episode.rating.toFixed(1)} · TMDB`}</strong><small>{episode.voteCount ? `${episode.voteCount.toLocaleString()} ${episode.voteCount === 1 ? "vote" : "votes"}${episode.voteCount < 10 ? " · Early rating" : ""}` : "No votes yet"}</small></div></div>
      <EpisodeActions episode={{tmdbId,showTitle,seasonNumber:season,episodeNumber:episode.episodeNumber,episodeName:episode.name,...(posterUrl?{posterUrl}:{}),...(year?{year}:{})}} favorites={favorites} />
      <details><summary>Show episode details <span>May contain spoilers</span></summary><p>{episode.overview || "A description hasn’t been added yet."}</p></details>
    </article>)}</div>
  </>;
}

function formatAirDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? "Air date unannounced" : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function jumpToEpisode(trigger: HTMLElement, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth";
  const dialog = trigger.closest('[role="dialog"]');
  if (dialog instanceof HTMLElement) dialog.scrollTo({top: dialog.scrollTop + target.getBoundingClientRect().top - dialog.getBoundingClientRect().top - 90, behavior});
  else target.scrollIntoView({block: "start", behavior});
  target.focus({preventScroll: true});
}
